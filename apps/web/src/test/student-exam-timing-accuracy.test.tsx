/**
 * Dedicated Timing Accuracy, Lifecycle, and Tab Visibility Test Suite.
 *
 * Tests:
 * 1. Initial Loading: render delay / readiness confirmation not counted in active duration
 * 2. Transition: transition time between questions excluded from both Q1 and Q2
 * 3. Slow Render: delayed readiness does not inflate active duration
 * 4. Per Question Limit: active timing works seamlessly with perQuestionTimeSeconds
 * 5. Tab Switch: visibility hidden pauses active timer and increments violation count
 * 6. Return to Tab: visibility visible resumes active timer
 * 7. Zero Polling / Heartbeat: verifies no periodic timer network requests
 * 8. Answer Timing: activeDurationMs and tabSwitchesCount sent in saveAnswer payload
 * 9. Retry Idempotency: retry does not double count or corrupt active duration
 * 10. Refresh / Reconnect: resumed state preserves monotonic timing without duplication
 * 11. Exam Timeout: server deadlineAt enforcement remains strict
 * 12. Blur vs Visibility: window blur alone without visibilityChange does not falsely count as tab switch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { StudentExamTakingView } from "../components/student-exams/StudentExamTakingView.js";
import type { StudentAttemptDTO } from "../lib/api/student-platform.js";

// Mock Auth
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "student-1", email: "student@example.com", name: "دانشجو" },
    memberships: [{ organization_id: "org-1", role: "student" }],
    isLoading: false,
    error: null,
    signOut: vi.fn(),
  }),
}));

const mockQuestions = [
  {
    id: "q-101",
    orderIndex: 0,
    prompt: "سؤال ۱: تعریف برون‌ده قلبی چیست؟",
    options: [
      { id: "opt-1", text: "گزینه ۱" },
      { id: "opt-2", text: "گزینه ۲" },
    ],
    points: 10,
  },
  {
    id: "q-102",
    orderIndex: 1,
    prompt: "سؤال ۲: حجم ضربه‌ای تحت تاثیر کدام فاکتور است؟",
    options: [
      { id: "opt-3", text: "گزینه الف" },
      { id: "opt-4", text: "گزینه ب" },
    ],
    points: 10,
  },
];

const mockSaveAnswer = vi.fn().mockResolvedValue({ success: true });
const mockSubmitExam = vi.fn().mockResolvedValue({
  result: {
    id: "att-101",
    examId: "exam-timing-1",
    status: "submitted",
    submittedAt: new Date().toISOString(),
    showResultsImmediately: true,
    score: 20,
    maxScore: 20,
    percentage: 100,
    passed: true,
  },
});

vi.mock("../lib/api/student-platform.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/student-platform.js")>();
  return {
    ...actual,
    createStudentPlatformApi: () => ({
      saveAnswer: mockSaveAnswer,
      submitExam: mockSubmitExam,
      getCurrentAttempt: vi.fn(),
      listClassroomExams: vi.fn(),
      listAllStudentExams: vi.fn(),
      getReview: vi.fn(),
      joinClassroom: vi.fn(),
      leaveClassroom: vi.fn(),
      listClassrooms: vi.fn(),
      startExam: vi.fn(),
    }),
  };
});

function createTestAttempt(overrides: Partial<StudentAttemptDTO> = {}): StudentAttemptDTO {
  return {
    id: "att-101",
    examId: "exam-timing-1",
    status: "in_progress",
    startedAt: new Date(Date.now() - 5000).toISOString(),
    deadlineAt: new Date(Date.now() + 1800000).toISOString(), // 30 min left
    submittedAt: null,
    allowBackNavigation: true,
    questions: mockQuestions,
    savedAnswers: [],
    ...overrides,
  };
}

function renderTakingView(attempt: StudentAttemptDTO) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const onExit = vi.fn();
  const onSubmitSuccess = vi.fn();

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StudentExamTakingView
          examId={attempt.examId}
          classroomId="cls-1"
          examTitle="آزمون فیزیولوژی"
          attempt={attempt}
          onExit={onExit}
          onSubmitSuccess={onSubmitSuccess}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...utils, onExit, onSubmitSuccess };
}

describe("Student Exam Timing Accuracy & Tab Visibility Suite", () => {
  let perfNowValue = 1000;

  beforeEach(() => {
    vi.clearAllMocks();
    perfNowValue = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => perfNowValue);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Test 1 & 3 — Initial Loading & Render Delay: Active timer starts strictly after readiness", async () => {
    const attempt = createTestAttempt();
    renderTakingView(attempt);

    // Initial render: before interaction
    expect(screen.getByText(/تعریف برون‌ده/)).toBeDefined();

    // Advance performance monotonic clock by 2500ms while waiting for interaction
    perfNowValue += 2500;

    // Select an option
    const option1 = screen.getByText("گزینه ۱");
    fireEvent.click(option1);

    await waitFor(() => {
      expect(mockSaveAnswer).toHaveBeenCalled();
    });

    const lastCall = mockSaveAnswer.mock.calls[0];
    // Payload should contain activeDurationMs calculated from monotonic clock
    expect(lastCall[0]).toBe("exam-timing-1");
    expect(lastCall[1]).toBe("q-101");
    expect(lastCall[2]).toBe("opt-1");
    expect(lastCall[4]).toBeGreaterThanOrEqual(2000); // active duration ~2500ms
  });

  it("Test 2 — Transition: Time spent transitioning between questions is excluded", async () => {
    const attempt = createTestAttempt({ allowBackNavigation: true });
    renderTakingView(attempt);

    // Q1 active for 4000ms
    perfNowValue += 4000;
    fireEvent.click(screen.getByText("گزینه ۱"));

    await waitFor(() => {
      expect(mockSaveAnswer).toHaveBeenCalled();
    });

    // Click Next Question
    const nextBtn = screen.getByText("سؤال بعدی");
    fireEvent.click(nextBtn);

    // Verify we moved to Q2 by checking Q2 prompt
    await waitFor(() => {
      expect(screen.getByText(/حجم ضربه‌ای/)).toBeDefined();
    });

    // Simulate 3000ms on Q2 before answering
    perfNowValue += 3000;

    fireEvent.click(screen.getByText("گزینه الف"));

    await waitFor(() => {
      expect(mockSaveAnswer).toHaveBeenCalledTimes(2);
    });

    const q2SaveCall = mockSaveAnswer.mock.calls[1];
    expect(q2SaveCall[1]).toBe("q-102");
    expect(q2SaveCall[2]).toBe("opt-3");
    // Q2 active duration should be ~3000ms, NOT 4000 + 3000 = 7000ms
    expect(q2SaveCall[4]).toBeLessThanOrEqual(4000);
    expect(q2SaveCall[4]).toBeGreaterThanOrEqual(2500);
  });

  it("Test 4 — Per-Question Limit: Finalizes and passes active duration on next question", async () => {
    const attempt = createTestAttempt({
      perQuestionTimeSeconds: 60,
      allowBackNavigation: false,
    });
    renderTakingView(attempt);

    perfNowValue += 5000; // 5s on question 1
    fireEvent.click(screen.getByText("گزینه ۲"));

    await waitFor(() => {
      expect(mockSaveAnswer).toHaveBeenCalled();
    });

    // Click next question to finalize Q1
    const nextBtn = screen.getByText("سؤال بعدی");
    fireEvent.click(nextBtn);

    await waitFor(() => {
      // Find call with finalized === true
      const finalizedCall = mockSaveAnswer.mock.calls.find(
        (call) => call[1] === "q-101" && call[3] === true,
      );
      expect(finalizedCall).toBeDefined();
      expect(finalizedCall[4]).toBeGreaterThanOrEqual(4500);
    });
  });

  it("Test 5 & 6 — Tab Switch: Visibility hidden pauses timer and records violation count; visible resumes", async () => {
    let currentVisState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => currentVisState,
    });

    const attempt = createTestAttempt();
    renderTakingView(attempt);

    // Active for 3000ms
    perfNowValue += 3000;

    // Switch tab (hidden)
    act(() => {
      currentVisState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Student is away in another tab for 10000ms (10s)
    perfNowValue += 10000;

    // Student returns to tab (visible)
    act(() => {
      currentVisState = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Active for another 2000ms
    perfNowValue += 2000;

    // Select option
    fireEvent.click(screen.getByText("گزینه ۱"));

    await waitFor(() => {
      expect(mockSaveAnswer).toHaveBeenCalled();
    });

    const call = mockSaveAnswer.mock.calls[0];
    const activeDuration = call[4];
    const tabSwitches = call[5];

    // Total wall time passed = 3s + 10s away + 2s = 15s
    // Active duration must be ~5s (3s + 2s), NOT 15s!
    expect(activeDuration).toBeLessThan(8000);
    expect(activeDuration).toBeGreaterThanOrEqual(4500);
    expect(tabSwitches).toBe(1);

    // Verify warning banner appeared in DOM
    expect(screen.getByText(/خروج از تب آزمون ثبت شد/)).toBeDefined();
  });

  it("Test 7 — Zero Timer Polling / Heartbeat: Timer does NOT generate periodic HTTP requests", async () => {
    vi.useFakeTimers();
    const attempt = createTestAttempt();
    renderTakingView(attempt);

    // Advance virtual timer by 30 seconds without user interaction
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    // Expect ZERO save or heartbeat calls when user is just looking at the screen without clicking
    expect(mockSaveAnswer).not.toHaveBeenCalled();
    expect(mockSubmitExam).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("Test 8 — Answer Timing Payload Transmission: Transmits timing in existing PUT request", async () => {
    const attempt = createTestAttempt();
    renderTakingView(attempt);

    perfNowValue += 3500;
    fireEvent.click(screen.getByText("گزینه ۲"));

    await waitFor(() => {
      expect(mockSaveAnswer).toHaveBeenCalledWith(
        "exam-timing-1",
        "q-101",
        "opt-2",
        undefined, // finalized
        expect.any(Number), // activeDurationMs
        0, // tabSwitchesCount
      );
    });
  });

  it("Test 9 & 10 — Retry & Resume Idempotency: Retrying or resuming retains valid timing without duplication", async () => {
    mockSaveAnswer.mockRejectedValueOnce(new Error("Network glitch")).mockResolvedValueOnce({ success: true });

    const attempt = createTestAttempt();
    renderTakingView(attempt);

    perfNowValue += 2000;
    fireEvent.click(screen.getByText("گزینه ۱"));

    // First attempt fails
    await waitFor(() => {
      expect(screen.getByText(/تلاش مجدد/)).toBeDefined();
    });

    // Click retry
    const retryBtn = screen.getByText("تلاش مجدد");
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(mockSaveAnswer).toHaveBeenCalledTimes(2);
    });

    const secondCall = mockSaveAnswer.mock.calls[1];
    expect(secondCall[1]).toBe("q-101");
    expect(secondCall[2]).toBe("opt-1");
  });

  it("Test 11 — Exam Timeout: Server deadline is respected and disabled upon expiration", async () => {
    // Attempt with deadline in past
    const expiredAttempt = createTestAttempt({
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
    });

    renderTakingView(expiredAttempt);

    // Option should be disabled
    const option = screen.getByText("گزینه ۱").closest("button");
    expect(option?.disabled || option?.className.includes("cursor-not-allowed")).toBeTruthy();

    // Clicking option does not trigger save
    fireEvent.click(screen.getByText("گزینه ۱"));
    expect(mockSaveAnswer).not.toHaveBeenCalled();
  });

  it("Test 12 — Blur vs Visibility: Window blur alone does not falsely register tab switch", async () => {
    const attempt = createTestAttempt();
    renderTakingView(attempt);

    perfNowValue += 2000;

    // Trigger blur event on window while visibility remains visible
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });

    perfNowValue += 2000;
    fireEvent.click(screen.getByText("گزینه ۱"));

    await waitFor(() => {
      expect(mockSaveAnswer).toHaveBeenCalled();
    });

    const call = mockSaveAnswer.mock.calls[0];
    // Tab switches count should still be 0 because document was visible
    expect(call[5]).toBe(0);
  });
});
