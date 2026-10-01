import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExamTakingView, calculateReconnectDelayMs } from "../components/quiz/ExamTakingView.js";
import { defaultExamOfflineStore } from "../lib/storage/exam-offline-store.js";

// Mock localStorage for test isolation
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

describe("ExamTakingView Offline & Batch Sync Invariants", () => {
  const mockQuestions = [
    {
      id: "q-1",
      question: "سؤال شماره یک تستی چیست؟",
      choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
      topic: "تست",
      difficulty: "medium",
    },
    {
      id: "q-2",
      question: "سؤال شماره دو تستی چیست؟",
      choices: ["گزینه ۱", "گزینه ۲"],
      topic: "تست",
      difficulty: "easy",
    },
  ];

  beforeEach(async () => {
    mockStorage.clear();
    await defaultExamOfflineStore.clearAttempt("test-attempt-sync-1");
  });

  it("1. Selecting choice updates local state and saves locally with revision, with ZERO immediate HTTP calls", async () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    // Mock fetch spy
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="test-attempt-sync-1"
        questions={mockQuestions}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Click choice "گزینه الف"
    const choiceBtn = screen.getByText("گزینه الف");
    fireEvent.click(choiceBtn);

    // Verify ZERO answer HTTP requests were fired
    const answerCallsAfterClick1 = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/answers")
    );
    expect(answerCallsAfterClick1).toHaveLength(0);

    // Verify answer was written locally to offline store
    await waitFor(async () => {
      const pending = await defaultExamOfflineStore.getPendingAnswers("test-attempt-sync-1");
      expect(pending).toHaveLength(1);
      expect(pending[0].questionId).toBe("q-1");
      expect(pending[0].answer).toBe("گزینه الف");
      expect(pending[0].revision).toBe(1);
      expect(pending[0].synced).toBe(false);
    });

    // Change choice to "گزینه ب"
    const choiceBtn2 = screen.getByText("گزینه ب");
    fireEvent.click(choiceBtn2);

    // Still ZERO answer HTTP requests
    const answerCallsAfterClick2 = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/answers")
    );
    expect(answerCallsAfterClick2).toHaveLength(0);

    // Monotonic revision increments to 2
    await waitFor(async () => {
      const pending = await defaultExamOfflineStore.getPendingAnswers("test-attempt-sync-1");
      expect(pending).toHaveLength(1);
      expect(pending[0].questionId).toBe("q-1");
      expect(pending[0].answer).toBe("گزینه ب");
      expect(pending[0].revision).toBe(2);
    });
  });

  it("2. Recovers previously saved offline answers upon component mount", async () => {
    // Pre-seed offline store with an unsynced answer
    await defaultExamOfflineStore.saveAnswer("test-attempt-sync-1", "q-1", "گزینه ج");

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="test-attempt-sync-1"
        questions={mockQuestions}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // Verify choice "گزینه ج" is selected in the UI (label has active class)
    await waitFor(() => {
      const label = screen.getByText("گزینه ج").closest("label");
      expect(label?.className).toContain("active");
    });
  });

  it("3. Final submit flushes pending answers first and clears local storage on success", async () => {
    const handleSubmitSuccess = vi.fn();

    // Mock successful fetch for submit
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/submit")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "req-1",
              attemptId: "test-attempt-sync-1",
              score: 100,
              correct: 2,
              total: 2,
              passed: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (url.includes("/answers")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "req-2",
              success: true,
              acknowledged: [{ questionId: "q-1", revision: 1 }],
              answers: { "q-1": "گزینه الف" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return Promise.reject(new Error("Unknown route"));
    });

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="test-attempt-sync-1"
        questions={mockQuestions}
        onExit={vi.fn()}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Select choice
    fireEvent.click(screen.getByText("گزینه الف"));

    // Click "پایان آزمون" to open confirmation modal
    fireEvent.click(screen.getByText("پایان آزمون"));

    // Click confirm in modal
    const confirmBtn = screen.getByRole("button", { name: "ثبت و مشاهده نتایج" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleSubmitSuccess).toHaveBeenCalled();
    });

    // Offline attempt data should be cleared on success
    const remainingPending = await defaultExamOfflineStore.getPendingAnswers("test-attempt-sync-1");
    expect(remainingPending).toHaveLength(0);
  });

  it("4. Rapid online events debounce and cancel pending reconnect timers", async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/answers")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                request_id: "req-sync",
                success: true,
                acknowledged: [{ questionId: "q-1", revision: 1 }],
                answers: { "q-1": "گزینه الف" },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        return Promise.reject(new Error("Unknown route"));
      });
      globalThis.fetch = fetchSpy;

      render(
        <ExamTakingView
          organizationId="test-org"
          attemptId="test-attempt-sync-1"
          questions={mockQuestions}
          onExit={vi.fn()}
          onSubmitSuccess={vi.fn()}
        />
      );

      // Select choice to create unsynced answer
      fireEvent.click(screen.getByText("گزینه الف"));

      // Dispatch 3 rapid online events within 100ms
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(50);
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(50);
      window.dispatchEvent(new Event("online"));

      // Advance timers past maximum possible jitter (8500ms + extra)
      await vi.advanceTimersByTimeAsync(9000);

      // Verify flushPendingAnswers was called, but only 1 sync request was dispatched despite 3 online events
      const answerCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes("/answers")
      );
      expect(answerCalls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("5. Offline event cancels any pending reconnect timer", async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      render(
        <ExamTakingView
          organizationId="test-org"
          attemptId="test-attempt-sync-1"
          questions={mockQuestions}
          onExit={vi.fn()}
          onSubmitSuccess={vi.fn()}
        />
      );

      // Select choice
      fireEvent.click(screen.getByText("گزینه الف"));

      // Dispatch online event
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(100);

      // Immediately go offline before reconnect timer fires
      window.dispatchEvent(new Event("offline"));

      // Advance timers past max jitter
      await vi.advanceTimersByTimeAsync(10000);

      // Verify no /answers call was dispatched
      const answerCalls = fetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes("/answers")
      );
      expect(answerCalls).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("calculateReconnectDelayMs jitter calculation", () => {
  it("calculates minimum delay with randomFn = 0", () => {
    expect(calculateReconnectDelayMs(1500, 7000, () => 0)).toBe(1500);
  });

  it("calculates maximum delay with randomFn ~ 1", () => {
    expect(calculateReconnectDelayMs(1500, 7000, () => 0.9999)).toBe(1500 + Math.floor(0.9999 * 7000));
  });

  it("calculates exact midpoint delay with randomFn = 0.5", () => {
    expect(calculateReconnectDelayMs(1500, 7000, () => 0.5)).toBe(5000);
  });

  it("supports custom base delay and jitter window", () => {
    expect(calculateReconnectDelayMs(2000, 3000, () => 0.25)).toBe(2750);
  });

  it("generates values within [1500, 8500) range with default randomFn", () => {
    for (let i = 0; i < 50; i++) {
      const delay = calculateReconnectDelayMs();
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThan(8500);
    }
  });
});
