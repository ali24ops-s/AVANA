import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ExamTakingView } from "../components/quiz/ExamTakingView.js";

const mockQuestions = [
  {
    id: "q-1",
    question: "مکانیسم اثر داروهای مهارکننده ACE چیست؟",
    choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
    topic: "فارماکولوژی",
  },
  {
    id: "q-2",
    question: "داروی بتابلاکر موثر در نارسایی قلب؟",
    choices: ["کارودیلول", "آتنولول"],
    topic: "کاردیولوژی",
  },
];

// Mock in-memory localStorage for test isolation
const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockStorage = createMockLocalStorage();
Object.defineProperty(window, "localStorage", {
  value: mockStorage,
  writable: true,
});

describe("Active Presence Exam Timer & Persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockStorage.clear();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    mockStorage.clear();
  });

  it("1. Count-up timer for exam without time limit starts and increments with active presence", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-no-limit-1"
        questions={mockQuestions}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Initial count-up starts at 00:00
    expect(screen.getByText("00:00")).toBeDefined();

    // Advance 10 seconds of active presence
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText("00:10")).toBeDefined();
  });

  it("2. User Scenario: 30-min limit -> 8 min active -> exit -> 2h wall-clock away -> re-enter -> remaining ~22:00", () => {
    const attemptId = "att-scenario-user";
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    // Step A: User enters 30-minute exam
    const { unmount } = render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        timeLimitMinutes={30}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    expect(screen.getByText("30:00")).toBeDefined();

    // Step B: User spends exactly 8 minutes (480 seconds) inside the exam page
    act(() => {
      vi.advanceTimersByTime(8 * 60 * 1000);
    });

    // 30 min - 8 min = 22:00 remaining
    expect(screen.getByText("22:00")).toBeDefined();

    // Step C: User exits the exam (navigates away / unmounts component)
    unmount();

    // Verify elapsed seconds are safely persisted locally as 480 seconds
    expect(window.localStorage.getItem(`avana_exam_elapsed_${attemptId}`)).toBe("480");

    // Step D: 2 hours pass in real world (7200 seconds) while user is away
    act(() => {
      vi.advanceTimersByTime(2 * 3600 * 1000);
    });

    // Step E: User returns from 'Recent Exams' 2 hours later
    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        timeLimitMinutes={30}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // The timer must resume at 22:00 remaining, NOT expired or 2 hours elapsed!
    expect(screen.getByText("22:00")).toBeDefined();

    // Step F: As user resumes taking exam, timer counts down from 22:00
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("21:59")).toBeDefined();
  });

  it("3. User Scenario: 30-min limit -> 8 min active -> hidden tab for 2h -> visible -> remaining ~22:00", () => {
    const attemptId = "att-scenario-hidden";

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        timeLimitMinutes={30}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("30:00")).toBeDefined();

    // 1. 8 minutes of active time
    act(() => {
      vi.advanceTimersByTime(8 * 60 * 1000);
    });
    expect(screen.getByText("22:00")).toBeDefined();

    // 2. Tab is switched to background / hidden
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // 3. User leaves tab hidden for 2 hours (7200 seconds)
    act(() => {
      vi.advanceTimersByTime(2 * 3600 * 1000);
    });

    // 4. User brings tab back to visible
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Time away in background must NOT be counted; timer remains at 22:00
    expect(screen.getByText("22:00")).toBeDefined();

    // Active ticking resumes from 22:00
    act(() => {
      vi.advanceTimersByTime(30000); // 30s active
    });
    expect(screen.getByText("21:30")).toBeDefined();
  });

  it("4. Idempotency: Multiple rapid visibilitychange/blur/focus events do NOT double-count time", () => {
    const attemptId = "att-idempotency";

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // 10s active
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText("00:10")).toBeDefined();

    // Fire hidden event
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange")); // duplicate
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("pagehide"));
    });

    // Advance 5s while hidden
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Elapsed should still strictly be 10 seconds
    expect(screen.getByText("00:10")).toBeDefined();

    // Fire visible event
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange")); // duplicate
      window.dispatchEvent(new Event("focus"));
    });

    // Advance 5s active
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Total must be exactly 15 seconds (10s + 5s)
    expect(screen.getByText("00:15")).toBeDefined();
  });

  it("5. Interval Throttling Edge-Case: Timestamp-based tracking prevents drift when browser throttles timer", () => {
    const attemptId = "att-throttling";

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("00:00")).toBeDefined();

    // Simulate browser throttling where interval fires after 15 seconds in a single burst
    act(() => {
      vi.advanceTimersByTime(15000);
    });

    // Because elapsed is calculated from Date.now() - sessionStart, it immediately reflects 15s without drift
    expect(screen.getByText("00:15")).toBeDefined();
  });

  it("6. Sub-second and last-second active slice is persisted on unmount/navigation", () => {
    const attemptId = "att-unmount-slice";
    const handleExit = vi.fn();

    const { unmount } = render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        onExit={handleExit}
        onSubmitSuccess={vi.fn()}
      />
    );

    // Active for 37 seconds
    act(() => {
      vi.advanceTimersByTime(37000);
    });

    // User unmounts
    unmount();

    // Exactly 37 seconds is persisted, not rounded down to an older interval
    expect(window.localStorage.getItem(`avana_exam_elapsed_${attemptId}`)).toBe("37");
  });

  it("7. Monotonic merge: Takes the maximum between server and localStorage and never decreases", () => {
    const attemptId = "att-monotonic";

    // Scenario A: localStorage has 120s, server has 60s -> 120s is used
    window.localStorage.setItem(`avana_exam_elapsed_${attemptId}`, "120");

    const { unmount } = render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        initialElapsedSeconds={60}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("02:00")).toBeDefined();
    unmount();

    // Scenario B: server has 300s, localStorage has 120s -> 300s is used
    window.localStorage.setItem(`avana_exam_elapsed_${attemptId}`, "120");

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        initialElapsedSeconds={300}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("05:00")).toBeDefined();
  });

  it("8. Timeout behavior: Auto-submits only when active presence reaches time limit; exiting page does NOT submit", async () => {
    const attemptId = "att-timeout";
    const handleSubmitSuccess = vi.fn();
    const handleExit = vi.fn();

    // Mock fetch for submit
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/submit")) {
        return {
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-timeout",
                attempt: { id: attemptId, score: 0 },
                attemptId,
                score: 0,
                correct: 0,
                total: 2,
                passed: false,
              })
            ),
        } as Response;
      }
      return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
    });

    const { unmount } = render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        timeLimitMinutes={1} // 60 seconds limit
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // 1. User stays for 40 seconds
    act(() => {
      vi.advanceTimersByTime(40000);
    });
    expect(screen.getByText("00:20")).toBeDefined();

    // 2. User exits page -> does NOT submit
    const exitBtn = screen.getByTitle("خروج از آزمون");
    fireEvent.click(exitBtn);
    expect(handleExit).toHaveBeenCalledTimes(1);
    expect(handleSubmitSuccess).not.toHaveBeenCalled();

    unmount();

    // 3. User re-enters
    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId={attemptId}
        questions={mockQuestions}
        timeLimitMinutes={1}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    expect(screen.getByText("00:20")).toBeDefined();

    // 4. User stays remaining 20 seconds -> active presence hits 00:00 -> auto submit
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(screen.getByText("00:00")).toBeDefined();
    // After auto-submit finishes
    await act(async () => {
      await Promise.resolve();
    });
    expect(handleSubmitSuccess).toHaveBeenCalled();
  });
});
