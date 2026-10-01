/**
 * Comprehensive Integration & Unit Test Suite for Student Teacher Platform Exams.
 *
 * Covers:
 * 1. Classroom: list classrooms, join success, invalid invite code, duplicate membership, leave
 * 2. Exam states: upcoming, active, closed, start, resume
 * 3. Taking: answer selection, answer autosave, server state after reload, timer based on deadlineAt
 * 4. Autosave race: A -> B -> C ensures final answer is C
 * 5. Submit race: pending autosave flush before submit, double submit prevention, grace period submit
 * 6. Results: unreleased results (strict concealment of keys/answers), released results (scores & keys)
 * 7. Security: unauthorized access handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { StudentClassroomsPage } from "../pages/student/StudentClassroomsPage.js";
import { StudentClassroomDetailPage } from "../pages/student/StudentClassroomDetailPage.js";
import { StudentExamDetailPage } from "../pages/student/StudentExamDetailPage.js";
import { StudentExamTakingView } from "../components/student-exams/StudentExamTakingView.js";
import { StudentExamResultsView } from "../components/student-exams/StudentExamResultsView.js";
import { JoinClassroomModal } from "../components/student-exams/JoinClassroomModal.js";
import type {
  StudentClassroomDTO,
  StudentExamListDTO,
  StudentAttemptDTO,
  StudentReviewDTO,
} from "../lib/api/student-platform.js";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "student-1", email: "student@example.com", name: "دانشجوی نمونه" },
    memberships: [{ organization_id: "org-1", role: "student" }],
    isLoading: false,
    error: null,
    signOut: vi.fn(),
  }),
}));

// Mock Commerce
vi.mock("../hooks/useCommerce.js", () => ({
  useMySubscription: () => ({
    data: { subscription: { status: "active", expires_at: new Date(Date.now() + 86400000).toISOString() } },
    isLoading: false,
  }),
}));

const mockClassrooms: StudentClassroomDTO[] = [
  {
    id: "cls-101",
    organizationId: "org-1",
    teacherId: "teacher-1",
    title: "کلاس فیزیولوژی پزشکی",
    description: "کلاس تخصصی فیزیولوژی ترم پاییز",
    status: "active",
    memberStatus: "active",
    firstJoinedAt: "2026-09-01T10:00:00.000Z",
    lastJoinedAt: "2026-09-01T10:00:00.000Z",
  },
];

const mockExams: StudentExamListDTO[] = [
  {
    id: "exam-upcoming",
    classroomId: "cls-101",
    title: "آزمون میان‌ترم فیزیولوژی",
    description: "فصل‌های ۱ تا ۴",
    durationMinutes: 45,
    startsAt: new Date(Date.now() + 86400000).toISOString(), // tomorrow
    endsAt: new Date(Date.now() + 172800000).toISOString(),
    passingScorePercentage: 60,
    showResultsImmediately: false,
    runtimeState: "upcoming",
    hasAttempt: false,
    attemptStatus: null,
    score: null,
    maxScore: null,
    percentage: null,
    passed: null,
  },
  {
    id: "exam-active",
    classroomId: "cls-101",
    title: "آزمون هفتگی قلب و عروق",
    description: "سیستم گردش خون",
    durationMinutes: 30,
    startsAt: new Date(Date.now() - 3600000).toISOString(), // 1h ago
    endsAt: new Date(Date.now() + 3600000).toISOString(),   // in 1h
    passingScorePercentage: 50,
    showResultsImmediately: true,
    allowBackNavigation: true,
    runtimeState: "active",
    hasAttempt: false,
    attemptStatus: null,
    score: null,
    maxScore: null,
    percentage: null,
    passed: null,
  },
  {
    id: "exam-closed",
    classroomId: "cls-101",
    title: "کوییز تنفس",
    description: "مکانیسم تهویه ریوی",
    durationMinutes: 15,
    startsAt: new Date(Date.now() - 7200000).toISOString(),
    endsAt: new Date(Date.now() - 3600000).toISOString(),
    passingScorePercentage: 70,
    showResultsImmediately: true,
    allowBackNavigation: true,
    runtimeState: "closed",
    hasAttempt: true,
    attemptStatus: "submitted",
    score: 80,
    maxScore: 100,
    percentage: 80,
    passed: true,
  },
];

const mockAttempt: StudentAttemptDTO = {
  id: "att-1",
  examId: "exam-active",
  status: "in_progress",
  startedAt: new Date(Date.now() - 60000).toISOString(),
  deadlineAt: new Date(Date.now() + 1800000).toISOString(), // 30 min left
  submittedAt: null,
  allowBackNavigation: true,
  questions: [
    {
      id: "q-1",
      orderIndex: 0,
      prompt: "گیرنده اصلی آدرنرژیک در قلب کدام است؟",
      options: [
        { id: "opt-1a", text: "بتا ۱" },
        { id: "opt-1b", text: "بتا ۲" },
        { id: "opt-1c", text: "آلفا ۱" },
        { id: "opt-1d", text: "آلفا ۲" },
      ],
      points: 10,
    },
    {
      id: "q-2",
      orderIndex: 1,
      prompt: "کدام موج در الکتروکاردیوگرام نشان‌دهنده دپلاریزاسیون بطن‌ها است؟",
      options: [
        { id: "opt-2a", text: "موج P" },
        { id: "opt-2b", text: "کمپلکس QRS" },
        { id: "opt-2c", text: "موج T" },
      ],
      points: 10,
    },
  ],
  savedAnswers: [{ questionId: "q-1", selectedOptionId: "opt-1a" }],
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Student Teacher Platform Exam Flow — Unit & Integration Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ---------------------------------------------------------------------------
  // 1. Classrooms
  // ---------------------------------------------------------------------------
  describe("Classrooms Management", () => {
    it("1.1. Lists enrolled classrooms with titles and active status", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ classrooms: mockClassrooms })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms"]}>
            <StudentClassroomsPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("کلاس فیزیولوژی پزشکی")).toBeInTheDocument();
      });
      expect(screen.getByText("عضو فعال")).toBeInTheDocument();
    });

    it("1.2. Join classroom converts invite code to uppercase trim and posts to backend", async () => {
      let postedBody: unknown = null;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (String(url).endsWith("/v1/student/classrooms/join")) {
          postedBody = JSON.parse(init?.body as string);
          return {
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  classroom: mockClassrooms[0],
                  member: { id: "mem-1", status: "active" },
                  membership: { id: "mem-1", status: "active" },
                  status: "joined",
                }),
              ),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      const onJoined = vi.fn();

      render(
        <QueryClientProvider client={qc}>
          <JoinClassroomModal isOpen={true} onClose={vi.fn()} onJoined={onJoined} />
        </QueryClientProvider>,
      );

      const input = screen.getByPlaceholderText("مثال: AB34XY78");
      fireEvent.change(input, { target: { value: "  ab34xy78  " } });

      const submitBtn = screen.getByRole("button", { name: "پیوستن به کلاس" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onJoined).toHaveBeenCalledWith("cls-101");
      });
      expect(postedBody).toEqual({ inviteCode: "AB34XY78" });
    });

    it("1.3. Displays clear Persian error when invite code is not found (404)", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms/join")) {
          return {
            ok: false,
            status: 404,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  error: { code: "not_found", message: "کلاس با این کد دعوت یافت نشد" },
                }),
              ),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <JoinClassroomModal isOpen={true} onClose={vi.fn()} />
        </QueryClientProvider>,
      );

      const input = screen.getByPlaceholderText("مثال: AB34XY78");
      fireEvent.change(input, { target: { value: "INVALID99" } });

      const submitBtn = screen.getByRole("button", { name: "پیوستن به کلاس" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText("کلاس با این کد دعوت یافت نشد. لطفاً از درستی کد اطمینان حاصل کنید."),
        ).toBeInTheDocument();
      });
    });

    it("1.4. Displays clear Persian error on duplicate membership (409)", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms/join")) {
          return {
            ok: false,
            status: 409,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  error: { code: "conflict", message: "شما هم‌اکنون عضو فعال این کلاس هستید" },
                }),
              ),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <JoinClassroomModal isOpen={true} onClose={vi.fn()} />
        </QueryClientProvider>,
      );

      const input = screen.getByPlaceholderText("مثال: AB34XY78");
      fireEvent.change(input, { target: { value: "DUPLICATE1" } });

      const submitBtn = screen.getByRole("button", { name: "پیوستن به کلاس" });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("شما هم‌اکنون عضو فعال این کلاس هستید.")).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Exam States (Upcoming / Active / Closed / Start / Resume)
  // ---------------------------------------------------------------------------
  describe("Exam States & Detail", () => {
    it("2.1. Upcoming exam renders start disabled with message", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: mockExams })),
          } as Response;
        }
        if (String(url).includes("/exams/exam-upcoming/current")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ attempt: null })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101/exams/exam-upcoming"]}>
            <Routes>
              <Route
                path="/classrooms/:classroomId/exams/:examId"
                element={<StudentExamDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getAllByText("آزمون میان‌ترم فیزیولوژی")[0]).toBeInTheDocument();
      });
      const ctaBtn = screen.getByRole("button", { name: "آزمون هنوز شروع نشده است" });
      expect(ctaBtn).toBeDisabled();
    });

    it("2.2. Active exam without attempt shows enabled Start Exam CTA", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: mockExams })),
          } as Response;
        }
        if (String(url).includes("/exams/exam-active/current")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ attempt: null })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101/exams/exam-active"]}>
            <Routes>
              <Route
                path="/classrooms/:classroomId/exams/:examId"
                element={<StudentExamDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getAllByText("آزمون هفتگی قلب و عروق")[0]).toBeInTheDocument();
      });
      const startBtn = screen.getByRole("button", { name: "شروع آزمون" });
      expect(startBtn).toBeEnabled();
    });

    it("2.3. Active exam with in_progress attempt renders Resume CTA", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: mockExams })),
          } as Response;
        }
        if (String(url).includes("/exams/exam-active/current")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ attempt: mockAttempt })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101/exams/exam-active"]}>
            <Routes>
              <Route
                path="/classrooms/:classroomId/exams/:examId"
                element={<StudentExamDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("ادامه آزمون")).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Taking & Server-Authoritative Timer
  // ---------------------------------------------------------------------------
  describe("Exam Taking & Timer", () => {
    it("3.1. Timer is calculated strictly from server deadlineAt", () => {
      const now = Date.now();
      // Server deadline set to exactly 10 minutes from now (600 seconds)
      const attemptWith10Min: StudentAttemptDTO = {
        ...mockAttempt,
        deadlineAt: new Date(now + 600 * 1000).toISOString(),
      };

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون هفتگی"
              attempt={attemptWith10Min}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // 10:00 in Persian digits: ۱۰:۰۰ (or 09:59 with execution jitter)
      expect(screen.getByText(/(۱۰:۰۰|۰۹:۵۹)/)).toBeInTheDocument();
    });

    it("3.2. Pre-populates saved answers from server attempt snapshot (Resume invariant)", () => {
      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون هفتگی"
              attempt={mockAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Question 1 has savedAnswer 'opt-1a' ("بتا ۱")
      // Check that 1 question is marked as answered
      expect(screen.getByText(/۱ پاسخ داده شده/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Autosave Race Safety: A -> B -> C Sequence
  // ---------------------------------------------------------------------------
  describe("Autosave Race Safety", () => {
    it("4.1. Rapid selection sequence A -> B -> C on question guarantees option C is finally sent to server", async () => {
      const savedCalls: string[] = [];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        if (String(url).includes("/answers/")) {
          const body = JSON.parse(init?.body as string);
          savedCalls.push(body.selectedOptionId);
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ success: true })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const freshAttempt: StudentAttemptDTO = { ...mockAttempt, savedAnswers: [] };
      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون هفتگی"
              attempt={freshAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Click option A (opt-1a), then B (opt-1b), then C (opt-1c) rapidly
      const optA = screen.getByText("بتا ۱");
      const optB = screen.getByText("بتا ۲");
      const optC = screen.getByText("آلفا ۱");

      fireEvent.click(optA);
      fireEvent.click(optB);
      fireEvent.click(optC);

      await waitFor(() => {
        // Last option called in the queue MUST be opt-1c
        expect(savedCalls.length).toBeGreaterThan(0);
        expect(savedCalls[savedCalls.length - 1]).toBe("opt-1c");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Submit Race Safety & Grace Period
  // ---------------------------------------------------------------------------
  describe("Submit Safety", () => {
    it("5.1. Flushes pending autosave before executing final submit", async () => {
      const callSequence: string[] = [];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/answers/")) {
          callSequence.push("save");
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ success: true })),
          } as Response;
        }
        if (String(url).includes("/submit")) {
          callSequence.push("submit");
          return {
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  result: {
                    id: "att-1",
                    examId: "exam-active",
                    status: "submitted",
                    showResultsImmediately: true,
                  },
                }),
              ),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const freshAttempt: StudentAttemptDTO = { ...mockAttempt, savedAnswers: [] };
      const qc = createTestQueryClient();
      const onSubmitSuccess = vi.fn();

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون هفتگی"
              attempt={freshAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={onSubmitSuccess}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Select an option
      const optB = screen.getByText("بتا ۲");
      fireEvent.click(optB);

      // Open submit dialog
      const openSubmitBtn = screen.getByRole("button", { name: "ثبت و پایان آزمون" });
      fireEvent.click(openSubmitBtn);

      // Confirm submit
      const confirmSubmitBtn = screen.getByRole("button", { name: "تأیید و ثبت نهایی" });
      fireEvent.click(confirmSubmitBtn);

      await waitFor(() => {
        expect(onSubmitSuccess).toHaveBeenCalled();
      });

      // Save was called and completed before submit!
      expect(callSequence).toContain("save");
      expect(callSequence).toContain("submit");
      const saveIdx = callSequence.indexOf("save");
      const submitIdx = callSequence.indexOf("submit");
      expect(saveIdx).toBeLessThan(submitIdx);
    });

    it("5.2. Failed autosave blocks submit and displays Persian error", async () => {
      let submitCalled = false;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/answers/")) {
          // Simulate network failure
          return {
            ok: false,
            status: 500,
            text: () =>
              Promise.resolve(
                JSON.stringify({ error: { code: "internal_error", message: "Server error" } }),
              ),
          } as Response;
        }
        if (String(url).includes("/submit")) {
          submitCalled = true;
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ result: {} })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const freshAttempt: StudentAttemptDTO = { ...mockAttempt, savedAnswers: [] };
      const qc = createTestQueryClient();

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون هفتگی"
              attempt={freshAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Select an option
      const optB = screen.getByText("بتا ۲");
      fireEvent.click(optB);

      // Wait for save to fail
      await waitFor(() => {
        expect(screen.getByText("خطا در ذخیره پاسخ روی سرور. لطفاً مجدداً تلاش کنید.")).toBeInTheDocument();
      });

      // Open submit dialog
      const openSubmitBtn = screen.getByRole("button", { name: "ثبت و پایان آزمون" });
      fireEvent.click(openSubmitBtn);

      // Confirm submit
      const confirmSubmitBtn = screen.getByRole("button", { name: "تأیید و ثبت نهایی" });
      fireEvent.click(confirmSubmitBtn);

      // Assert error is displayed and submit was NOT called
      await waitFor(() => {
        expect(
          screen.getByText("برخی پاسخ‌ها هنوز ذخیره نشده‌اند. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."),
        ).toBeInTheDocument();
      });
      expect(submitCalled).toBe(false);
    });

    it("5.3. Retrying failed answer allows subsequent submit in correct order", async () => {
      const callSequence: string[] = [];
      let attemptCount = 0;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/answers/")) {
          attemptCount++;
          callSequence.push("save");
          if (attemptCount === 1) {
            // First attempt fails
            return {
              ok: false,
              status: 500,
              text: () => Promise.resolve(JSON.stringify({ error: { message: "Fail" } })),
            } as Response;
          }
          // Retry succeeds
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ success: true })),
          } as Response;
        }
        if (String(url).includes("/submit")) {
          callSequence.push("submit");
          return {
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  result: {
                    id: "att-1",
                    examId: "exam-active",
                    status: "submitted",
                    showResultsImmediately: true,
                  },
                }),
              ),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const freshAttempt: StudentAttemptDTO = { ...mockAttempt, savedAnswers: [] };
      const qc = createTestQueryClient();
      const onSubmitSuccess = vi.fn();

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون هفتگی"
              attempt={freshAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={onSubmitSuccess}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Select an option
      const optB = screen.getByText("بتا ۲");
      fireEvent.click(optB);

      // Wait for failure UI and retry button
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "تلاش مجدد" })).toBeInTheDocument();
      });

      // Click retry
      fireEvent.click(screen.getByRole("button", { name: "تلاش مجدد" }));

      // Wait for save to succeed
      await waitFor(() => {
        expect(screen.getByText("ذخیره شد")).toBeInTheDocument();
      });

      // Submit
      const openSubmitBtn = screen.getByRole("button", { name: "ثبت و پایان آزمون" });
      fireEvent.click(openSubmitBtn);
      const confirmSubmitBtn = screen.getByRole("button", { name: "تأیید و ثبت نهایی" });
      fireEvent.click(confirmSubmitBtn);

      await waitFor(() => {
        expect(onSubmitSuccess).toHaveBeenCalled();
      });

      // Verify sequence: save (fail) -> save (retry success) -> submit
      expect(callSequence).toEqual(["save", "save", "submit"]);
    });

    it("5.4. Prevents duplicate concurrent submissions when submit button is double-clicked", async () => {
      let submitCallCount = 0;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/submit")) {
          submitCallCount++;
          // Add artificial delay to keep in flight
          await new Promise((r) => setTimeout(r, 100));
          return {
            ok: true,
            status: 200,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  result: {
                    id: "att-1",
                    examId: "exam-active",
                    status: "submitted",
                    showResultsImmediately: true,
                  },
                }),
              ),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      const onSubmitSuccess = vi.fn();

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون هفتگی"
              attempt={mockAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={onSubmitSuccess}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Open submit dialog
      const openSubmitBtn = screen.getByRole("button", { name: "ثبت و پایان آزمون" });
      fireEvent.click(openSubmitBtn);

      const confirmSubmitBtn = screen.getByRole("button", { name: "تأیید و ثبت نهایی" });

      // Click rapidly twice
      fireEvent.click(confirmSubmitBtn);
      fireEvent.click(confirmSubmitBtn);

      await waitFor(() => {
        expect(onSubmitSuccess).toHaveBeenCalledTimes(1);
      });

      expect(submitCallCount).toBe(1);
    });

    it("5.5. Handles 409 conflict gracefully by invalidating queries and redirecting without crash", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/submit")) {
          return {
            ok: false,
            status: 409,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  error: { code: "conflict", message: "این آزمون قبلاً پایان یافته و ثبت شده است" },
                }),
              ),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101/exams/exam-active/take"]}>
            <Routes>
              <Route
                path="/classrooms/:classroomId/exams/:examId/take"
                element={
                  <StudentExamTakingView
                    examId="exam-active"
                    classroomId="cls-101"
                    examTitle="آزمون هفتگی"
                    attempt={mockAttempt}
                    onExit={vi.fn()}
                    onSubmitSuccess={vi.fn()}
                  />
                }
              />
              <Route
                path="/classrooms/:classroomId/exams/:examId/results"
                element={<div>صفحه نتایج آزمون</div>}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Open submit dialog
      const openSubmitBtn = screen.getByRole("button", { name: "ثبت و پایان آزمون" });
      fireEvent.click(openSubmitBtn);

      const confirmSubmitBtn = screen.getByRole("button", { name: "تأیید و ثبت نهایی" });
      fireEvent.click(confirmSubmitBtn);

      // Successfully redirected to results page without crash
      await waitFor(() => {
        expect(screen.getByText("صفحه نتایج آزمون")).toBeInTheDocument();
      });

      // Assert queries were invalidated
      expect(invalidateSpy).toHaveBeenCalled();
    });

    it("5.6. Enforces disabled options once deadline passes and shows grace period notice", () => {
      const pastDeadlineAttempt: StudentAttemptDTO = {
        ...mockAttempt,
        deadlineAt: new Date(Date.now() - 5000).toISOString(), // 5s past deadline
      };

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون هفتگی"
              attempt={pastDeadlineAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(
        screen.getByText(
          "زمان پاسخگویی به پایان رسیده است. شما در مهلت ۶۰ ثانیه‌ای ثبت و ارسال نهایی هستید.",
        ),
      ).toBeInTheDocument();

      // Options should be disabled
      const optBtns = screen.getAllByRole("button").filter((b) => b.className.includes("text-right"));
      for (const btn of optBtns) {
        expect(btn).toBeDisabled();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Results & Review Security
  // ---------------------------------------------------------------------------
  describe("Results & Review Concealment Security", () => {
    it("6.1. When results are NOT released, strictly conceals answers, scores, and keys", () => {
      const unreleasedReview: StudentReviewDTO = {
        id: "att-1",
        examId: "exam-active",
        status: "submitted",
        submittedAt: "2026-09-30T12:00:00.000Z",
        resultsReleased: false,
        message: "نتایج این آزمون پس از پایان مهلت آزمون یا انتشار توسط استاد در دسترس خواهد بود.",
      };

      render(
        <MemoryRouter>
          <StudentExamResultsView
            examTitle="آزمون هفتگی"
            classroomId="cls-101"
            review={unreleasedReview}
          />
        </MemoryRouter>,
      );

      // Displays confirmation and official message
      expect(screen.getByText("پاسخ‌ها با موفقیت ثبت شد")).toBeInTheDocument();
      expect(
        screen.getByText(
          "نتایج این آزمون پس از پایان مهلت آزمون یا انتشار توسط استاد در دسترس خواهد بود.",
        ),
      ).toBeInTheDocument();

      // Invariant: Question breakdown or score percentages are NOT rendered
      expect(screen.queryByText("بررسی سؤالات و پاسخ‌ها")).toBeNull();
      expect(screen.queryByText("گزینه صحیح")).toBeNull();
      expect(screen.queryByText("نمره نهایی")).toBeNull();
    });

    it("6.2. When results are released, displays score, pass status, and question review", () => {
      const releasedReview: StudentReviewDTO = {
        id: "att-1",
        examId: "exam-active",
        status: "submitted",
        submittedAt: "2026-09-30T12:00:00.000Z",
        resultsReleased: true,
        score: 20,
        maxScore: 20,
        percentage: 100,
        passed: true,
        questions: [
          {
            questionId: "q-1",
            orderIndex: 0,
            prompt: "گیرنده اصلی آدرنرژیک در قلب کدام است؟",
            options: [
              { id: "opt-1a", text: "بتا ۱" },
              { id: "opt-1b", text: "بتا ۲" },
            ],
            selectedOptionId: "opt-1a",
            correctOptionId: "opt-1a",
            explanation: "گیرنده‌های بتا ۱ اثر اینوتروپ و کرونوتروپ مثبت دارند.",
            isCorrect: true,
            pointsEarned: 10,
            maxPoints: 10,
          },
        ],
      };

      render(
        <MemoryRouter>
          <StudentExamResultsView
            examTitle="آزمون هفتگی"
            classroomId="cls-101"
            review={releasedReview}
          />
        </MemoryRouter>,
      );

      // Displays hero metrics
      expect(screen.getByText(/۱۰۰٪/)).toBeInTheDocument();
      expect(screen.getByText("قبول")).toBeInTheDocument();
      expect(screen.getByText("بررسی سؤالات و پاسخ‌ها")).toBeInTheDocument();
      expect(screen.getByText("پاسخ صحیح")).toBeInTheDocument();
      expect(screen.getByText("گزینه صحیح")).toBeInTheDocument();
      expect(
        screen.getByText("گیرنده‌های بتا ۱ اثر اینوتروپ و کرونوتروپ مثبت دارند."),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Security & IDOR Access Control
  // ---------------------------------------------------------------------------
  describe("Security & IDOR Isolation", () => {
    it("7.1. Unauthorized / non-member student receives friendly empty state without leaking data", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/student/classrooms/cls-foreign/exams")) {
          return {
            ok: false,
            status: 403,
            text: () =>
              Promise.resolve(
                JSON.stringify({
                  error: { code: "forbidden", message: "شما عضو فعال این کلاس نیستید" },
                }),
              ),
          } as Response;
        }
        if (String(url).endsWith("/v1/student/classrooms")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ classrooms: [] })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-foreign"]}>
            <Routes>
              <Route
                path="/classrooms/:classroomId"
                element={<StudentClassroomDetailPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("کلاس یافت نشد")).toBeInTheDocument();
      });
      expect(
        screen.getByText("اطلاعات این کلاس در دسترس نیست یا شما عضو فعال آن نیستید."),
      ).toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // 7.2 - 7.7 Classroom Detail Exam Listing & Counter Consistency Suite
    // ---------------------------------------------------------------------------
    it("7.2. Upcoming exam: counted, rendered in list with 'شروع نشده', start disabled", async () => {
      const upcomingExam: StudentExamListDTO = {
        id: "exam-up-1",
        classroomId: "cls-101",
        title: "آزمون آینده فیزیولوژی",
        description: "مباحث فصل ۱",
        durationMinutes: 30,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 172800000).toISOString(),
        passingScorePercentage: 50,
        showResultsImmediately: false,
        allowBackNavigation: true,
        runtimeState: "upcoming",
        hasAttempt: false,
        attemptStatus: null,
        score: null,
        maxScore: null,
        percentage: null,
        passed: null,
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ classrooms: mockClassrooms })),
          } as Response;
        }
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: [upcomingExam] })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101"]}>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getAllByText("آزمون آینده فیزیولوژی")[0]).toBeInTheDocument();
      });

      expect(screen.getByText("۱ آزمون منتشر شده")).toBeInTheDocument();
      const disabledBtns = screen.getAllByRole("button", { name: "شروع نشده" });
      expect(disabledBtns.length).toBeGreaterThan(0);
      disabledBtns.forEach((btn) => expect(btn).toBeDisabled());
    });

    it("7.3. Active exam: counted, rendered in list with 'در حال برگزاری', start button enabled", async () => {
      const activeExam: StudentExamListDTO = {
        id: "exam-act-1",
        classroomId: "cls-101",
        title: "آزمون جاری بیوشیمی",
        description: "مباحث آنزیم‌ها",
        durationMinutes: 45,
        startsAt: new Date(Date.now() - 1800000).toISOString(),
        endsAt: new Date(Date.now() + 1800000).toISOString(),
        passingScorePercentage: 60,
        showResultsImmediately: true,
        allowBackNavigation: true,
        runtimeState: "active",
        hasAttempt: false,
        attemptStatus: null,
        score: null,
        maxScore: null,
        percentage: null,
        passed: null,
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ classrooms: mockClassrooms })),
          } as Response;
        }
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: [activeExam] })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101"]}>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getAllByText("آزمون جاری بیوشیمی")[0]).toBeInTheDocument();
      });

      expect(screen.getByText("۱ آزمون منتشر شده")).toBeInTheDocument();
      const startLinks = screen.getAllByRole("link").filter((l) =>
        l.getAttribute("href")?.includes("/exams/exam-act-1"),
      );
      expect(startLinks.length).toBeGreaterThan(0);
      expect(screen.getAllByText("شرکت در آزمون").length).toBeGreaterThan(0);
    });

    it("7.4. Closed exam with completed attempt: renders 'پایان یافته', score, and enabled 'مشاهده نتیجه' link", async () => {
      const completedExam: StudentExamListDTO = {
        id: "exam-comp-1",
        classroomId: "cls-101",
        title: "آزمون پایان‌یافته با شرکت",
        description: "مباحث ژنتیک",
        durationMinutes: 20,
        startsAt: new Date(Date.now() - 86400000).toISOString(),
        endsAt: new Date(Date.now() - 43200000).toISOString(),
        passingScorePercentage: 50,
        showResultsImmediately: true,
        allowBackNavigation: true,
        runtimeState: "closed",
        hasAttempt: true,
        attemptStatus: "submitted",
        score: 90,
        maxScore: 100,
        percentage: 90,
        passed: true,
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ classrooms: mockClassrooms })),
          } as Response;
        }
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: [completedExam] })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101"]}>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getAllByText("آزمون پایان‌یافته با شرکت")[0]).toBeInTheDocument();
      });

      expect(screen.getByText("۱ آزمون منتشر شده")).toBeInTheDocument();
      expect(screen.getAllByText(/نمره: ۹۰ از ۱۰۰/)[0]).toBeInTheDocument();
      const resultsLinks = screen.getAllByRole("link").filter((l) =>
        l.getAttribute("href")?.includes("/exams/exam-comp-1/results"),
      );
      expect(resultsLinks.length).toBeGreaterThan(0);
      expect(screen.getAllByText("مشاهده نتیجه").length).toBeGreaterThan(0);
    });

    it("7.5. Closed exam WITHOUT attempt: remains in list, shows 'شرکت نکرده‌اید', button is disabled 'پایان یافته' (no broken results link)", async () => {
      const missedExam: StudentExamListDTO = {
        id: "exam-missed-1",
        classroomId: "cls-101",
        title: "آزمون پایان‌یافته بدون شرکت (دیروز)",
        description: "مباحث بافت‌شناسی",
        durationMinutes: 30,
        startsAt: new Date(Date.now() - 86400000).toISOString(),
        endsAt: new Date(Date.now() - 3600000).toISOString(),
        passingScorePercentage: 60,
        showResultsImmediately: true,
        allowBackNavigation: true,
        runtimeState: "closed",
        hasAttempt: false,
        attemptStatus: null,
        score: null,
        maxScore: null,
        percentage: null,
        passed: null,
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ classrooms: mockClassrooms })),
          } as Response;
        }
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: [missedExam] })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101"]}>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getAllByText("آزمون پایان‌یافته بدون شرکت (دیروز)")[0],
        ).toBeInTheDocument();
      });

      // 1. Exam remains in list and counter is accurate
      expect(screen.getByText("۱ آزمون منتشر شده")).toBeInTheDocument();

      // 2. Status indicates student did not take exam
      expect(screen.getAllByText("شرکت نکرده‌اید").length).toBeGreaterThan(0);

      // 3. Button is disabled "پایان یافته"
      const closedBtns = screen.getAllByRole("button", { name: "پایان یافته" });
      expect(closedBtns.length).toBeGreaterThan(0);
      closedBtns.forEach((btn) => expect(btn).toBeDisabled());

      // 4. CRITICAL: No link to results page exists (preventing empty/404 review view)
      const resultsLinks = screen.queryAllByRole("link").filter((l) =>
        l.getAttribute("href")?.includes("/results"),
      );
      expect(resultsLinks).toHaveLength(0);
    });

    it("7.6. Classroom with 0 exams: shows count 0 and clean empty state", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ classrooms: mockClassrooms })),
          } as Response;
        }
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: [] })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101"]}>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByText("هنوز آزمونی برای این کلاس تعریف یا منتشر نشده است"),
        ).toBeInTheDocument();
      });

      expect(screen.getByText("۰ آزمون منتشر شده")).toBeInTheDocument();
    });

    it("7.7. Mixed exams in classroom: count strictly matches total items and actions match states", async () => {
      const mixedExams: StudentExamListDTO[] = [
        {
          id: "exam-1-up",
          classroomId: "cls-101",
          title: "آزمون آینده ۱",
          description: null,
          durationMinutes: 30,
          startsAt: new Date(Date.now() + 86400000).toISOString(),
          endsAt: new Date(Date.now() + 172800000).toISOString(),
          passingScorePercentage: 50,
          showResultsImmediately: false,
          allowBackNavigation: true,
          runtimeState: "upcoming",
          hasAttempt: false,
          attemptStatus: null,
          score: null,
          maxScore: null,
          percentage: null,
          passed: null,
        },
        {
          id: "exam-2-act",
          classroomId: "cls-101",
          title: "آزمون فعال ۲",
          description: null,
          durationMinutes: 30,
          startsAt: new Date(Date.now() - 1800000).toISOString(),
          endsAt: new Date(Date.now() + 1800000).toISOString(),
          passingScorePercentage: 50,
          showResultsImmediately: true,
          allowBackNavigation: true,
          runtimeState: "active",
          hasAttempt: false,
          attemptStatus: null,
          score: null,
          maxScore: null,
          percentage: null,
          passed: null,
        },
        {
          id: "exam-3-closed-missed",
          classroomId: "cls-101",
          title: "آزمون گذشته بدون شرکت ۳",
          description: null,
          durationMinutes: 30,
          startsAt: new Date(Date.now() - 86400000).toISOString(),
          endsAt: new Date(Date.now() - 3600000).toISOString(),
          passingScorePercentage: 50,
          showResultsImmediately: true,
          allowBackNavigation: true,
          runtimeState: "closed",
          hasAttempt: false,
          attemptStatus: null,
          score: null,
          maxScore: null,
          percentage: null,
          passed: null,
        },
        {
          id: "exam-4-closed-done",
          classroomId: "cls-101",
          title: "آزمون گذشته دارای نمره ۴",
          description: null,
          durationMinutes: 30,
          startsAt: new Date(Date.now() - 86400000).toISOString(),
          endsAt: new Date(Date.now() - 3600000).toISOString(),
          passingScorePercentage: 50,
          showResultsImmediately: true,
          allowBackNavigation: true,
          runtimeState: "closed",
          hasAttempt: true,
          attemptStatus: "submitted",
          score: 85,
          maxScore: 100,
          percentage: 85,
          passed: true,
        },
      ];

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).endsWith("/v1/student/classrooms")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ classrooms: mockClassrooms })),
          } as Response;
        }
        if (String(url).includes("/classrooms/cls-101/exams")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ exams: mixedExams })),
          } as Response;
        }
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      });

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/classrooms/cls-101"]}>
            <Routes>
              <Route path="/classrooms/:classroomId" element={<StudentClassroomDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getAllByText("آزمون آینده ۱")[0]).toBeInTheDocument();
        expect(screen.getAllByText("آزمون فعال ۲")[0]).toBeInTheDocument();
        expect(screen.getAllByText("آزمون گذشته بدون شرکت ۳")[0]).toBeInTheDocument();
        expect(screen.getAllByText("آزمون گذشته دارای نمره ۴")[0]).toBeInTheDocument();
      });

      // Counter matches total
      expect(screen.getByText("۴ آزمون منتشر شده")).toBeInTheDocument();

      // Exam 4 has results link, Exam 3 does NOT
      const resultsLinks = screen.getAllByRole("link").filter((l) =>
        l.getAttribute("href")?.includes("/results"),
      );
      expect(resultsLinks.length).toBeGreaterThan(0);
      resultsLinks.forEach((link) => {
        expect(link.getAttribute("href")).toContain("exam-4-closed-done");
        expect(link.getAttribute("href")).not.toContain("exam-3-closed-missed");
      });
    });
  });

  describe("8. allowBackNavigation Feature Suite", () => {
    beforeEach(() => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
        if (String(url).includes("/answers/")) {
          return {
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ success: true })),
            json: () => Promise.resolve({ success: true }),
            headers: new Headers(),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          text: () => Promise.resolve("{}"),
          json: () => Promise.resolve({}),
          headers: new Headers(),
        } as Response;
      });
    });

    it("8.1. allowBackNavigation === true allows full backward navigation, answer review, modification, and re-advancing", async () => {
      const attemptTrue: StudentAttemptDTO = {
        ...mockAttempt,
        allowBackNavigation: true,
        savedAnswers: [],
      };

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون با قابلیت بازگشت"
              attempt={attemptTrue}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // 1. On Question 1 -> Answer beta 1
      expect(screen.getByText(/گیرنده اصلی آدرنرژیک/)).toBeInTheDocument();
      const optBeta1 = screen.getByText("بتا ۱");
      fireEvent.click(optBeta1);

      // 2. Navigate to Question 2
      const nextBtn = screen.getByRole("button", { name: /سؤال بعدی/ });
      fireEvent.click(nextBtn);

      // Verify on Question 2
      expect(await screen.findByText("کمپلکس QRS")).toBeInTheDocument();

      // 3. Navigate BACK to Question 1
      const prevBtn = screen.getByRole("button", { name: /سؤال قبلی/ });
      expect(prevBtn).toBeEnabled();
      fireEvent.click(prevBtn);

      // 4. Verify back on Question 1, previous answer is selected
      expect(await screen.findByText("بتا ۱")).toBeInTheDocument();
      const optBeta1Container = screen.getByText("بتا ۱").closest("button");
      expect(optBeta1Container).toHaveClass("border-[#008080]");

      // 5. Modify answer to beta 2
      const optBeta2 = screen.getByText("بتا ۲");
      fireEvent.click(optBeta2);

      // 6. Navigate forward to Question 2 again
      const nextBtnAgain = screen.getByRole("button", { name: /سؤال بعدی/ });
      fireEvent.click(nextBtnAgain);
      expect(await screen.findByText("کمپلکس QRS")).toBeInTheDocument();
    });

    it("8.2. allowBackNavigation === false disables previous button and prevents clicking previous question pills", async () => {
      const attemptFalse: StudentAttemptDTO = {
        ...mockAttempt,
        allowBackNavigation: false,
        savedAnswers: [],
      };

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون بدون بازگشت"
              attempt={attemptFalse}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // On Question 1 -> Previous button is disabled
      const prevBtn = screen.getByRole("button", { name: /سؤال قبلی/ });
      expect(prevBtn).toBeDisabled();

      // Answer Question 1
      const optBeta1 = screen.getByText("بتا ۱");
      fireEvent.click(optBeta1);

      // Move to Question 2
      const nextBtn = screen.getByRole("button", { name: /سؤال بعدی/ });
      fireEvent.click(nextBtn);

      expect(await screen.findByText("کمپلکس QRS")).toBeInTheDocument();

      // On Question 2 with allowBackNavigation: false
      // Previous button MUST BE disabled!
      expect(prevBtn).toBeDisabled();

      // Question 1 pill (pill '۱') MUST BE disabled
      const pills = screen.getAllByRole("button").filter((b) => b.textContent === "۱");
      const q1Pill = pills[0];
      expect(q1Pill).toBeDisabled();
      expect(q1Pill).toHaveClass("cursor-not-allowed");

      // Clicking Q1 pill does NOT navigate away from Question 2
      fireEvent.click(q1Pill);
      expect(screen.getByText("کمپلکس QRS")).toBeInTheDocument();
    });

    it("8.3. allowBackNavigation === false resume initializes at first unanswered question", () => {
      const resumeAttempt: StudentAttemptDTO = {
        ...mockAttempt,
        allowBackNavigation: false,
        savedAnswers: [{ questionId: "q-1", selectedOptionId: "opt-1a" }],
      };

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون بدون بازگشت - Resume"
              attempt={resumeAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Starts directly on Question 2 (first unanswered question)
      expect(screen.getByText(/الکتروکاردیوگرام/)).toBeInTheDocument();

      // Question 1 pill is disabled
      const pills = screen.getAllByRole("button").filter((b) => b.textContent === "۱");
      expect(pills[0]).toBeDisabled();
      expect(screen.getByRole("button", { name: /سؤال قبلی/ })).toBeDisabled();
    });

    it("8.4. allowBackNavigation === false when all questions answered resumes at last question ready for submission", () => {
      const allAnsweredAttempt: StudentAttemptDTO = {
        ...mockAttempt,
        allowBackNavigation: false,
        savedAnswers: [
          { questionId: "q-1", selectedOptionId: "opt-1a" },
          { questionId: "q-2", selectedOptionId: "opt-2b" },
        ],
      };

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون بدون بازگشت - All Answered"
              attempt={allAnsweredAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Starts on Question 2 (the final question)
      expect(screen.getByText("کدام موج در الکتروکاردیوگرام نشان‌دهنده دپلاریزاسیون بطن‌ها است؟")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /پایان آزمون/ }).length).toBeGreaterThan(0);
    });
  });

  describe("9. Per-Question Timing (perQuestionTimeSeconds) UI Suite", () => {
    it("9.1. Displays question timer badge and enforces sequential navigation", () => {
      const now = Date.now();
      const timedAttempt: StudentAttemptDTO = {
        ...mockAttempt,
        startedAt: new Date(now - 5000).toISOString(), // started 5s ago
        deadlineAt: new Date(now + 3600000).toISOString(),
        perQuestionTimeSeconds: 30, // 30s per question (25s left on Q1)
        allowBackNavigation: false,
        savedAnswers: [],
      };

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون ۳۰ ثانیه برای هر سؤال"
              attempt={timedAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Shows per-question timer badge
      expect(screen.getByText(/زمان سؤال:/)).toBeInTheDocument();

      // Back button is disabled
      const prevBtn = screen.getByRole("button", { name: /سؤال قبلی/ });
      expect(prevBtn).toBeDisabled();

      // Future question pill '۲' is disabled
      const pills = screen.getAllByRole("button").filter((b) => b.textContent === "۲");
      expect(pills[0]).toBeDisabled();
    });

    it("9.2. Resumes on active question based on server timestamps", () => {
      const now = Date.now();
      // Q1 was finalized 10s ago, so Q2 is currently active (20s left)
      const timedAttempt: StudentAttemptDTO = {
        ...mockAttempt,
        startedAt: new Date(now - 40000).toISOString(),
        deadlineAt: new Date(now + 3600000).toISOString(),
        perQuestionTimeSeconds: 30,
        allowBackNavigation: false,
        savedAnswers: [
          {
            questionId: "q-1",
            selectedOptionId: "opt-1a",
            answeredAt: new Date(now - 20000).toISOString(),
            finalizedAt: new Date(now - 10000).toISOString(),
          },
        ],
      };

      const qc = createTestQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <StudentExamTakingView
              examId="exam-active"
              classroomId="cls-101"
              examTitle="آزمون ۳۰ ثانیه‌ای بازگشت به سؤال ۲"
              attempt={timedAttempt}
              onExit={vi.fn()}
              onSubmitSuccess={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Active question is Question 2 (QRS)
      expect(screen.getByText(/الکتروکاردیوگرام/)).toBeInTheDocument();
      expect(screen.getByText(/زمان سؤال:/)).toBeInTheDocument();
    });
  });
});
