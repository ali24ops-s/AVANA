import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useStudySessionTracker } from "../hooks/useStudySessionTracker.js";
import { HomePage } from "../pages/HomePage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("useStudySessionTracker Hook & Study Time Display", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("starts session on mount and sends heartbeats periodically while active", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/study-sessions/start")) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              request_id: "req-1",
              session: {
                id: "session-123",
                userId: "user-1",
                activityType: "lesson",
                startedAt: new Date().toISOString(),
                lastActivityAt: new Date().toISOString(),
                durationSeconds: 0,
              },
            }),
        } as Response);
      }
      if (urlStr.includes("/v1/study-sessions/heartbeat")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-2",
              sessionId: "session-123",
              durationSeconds: 30,
              lastActivityAt: new Date().toISOString(),
            }),
        } as Response);
      }
      if (urlStr.includes("/v1/study-sessions/end")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-3",
              sessionId: "session-123",
              durationSeconds: 30,
              endedAt: new Date().toISOString(),
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });

    const { unmount } = renderHook(() =>
      useStudySessionTracker({
        activityType: "lesson",
        courseId: "course-123",
        lessonId: "lesson-456",
        enabled: true,
      }),
    );

    // Initial mount triggers start
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/study-sessions/start"),
      expect.objectContaining({
        method: "POST",
      }),
    );

    // Flush async startSession promise resolution so sessionId is populated
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Advance 30 seconds -> triggers heartbeat
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/study-sessions/heartbeat"),
      expect.objectContaining({
        method: "POST",
      }),
    );

    // Unmount triggers session end
    unmount();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/study-sessions/end"),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("pauses heartbeats when tab is hidden in background", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            request_id: "req-1",
            session: { id: "session-abc" },
          }),
      } as Response),
    );

    // Mock document.visibilityState to hidden
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });

    renderHook(() =>
      useStudySessionTracker({
        activityType: "flashcard",
        enabled: true,
      }),
    );

    // Advance timer 30s while hidden
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    // Heartbeat should NOT have been called while hidden
    const heartbeatCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/v1/study-sessions/heartbeat"),
    );
    expect(heartbeatCalls).toHaveLength(0);

    // Restore visibilityState
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  it("renders dynamic study time and change percentage on Dashboard", async () => {
    vi.useRealTimers();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "u-1", email: "student@avana.ir", role: "student" },
            }),
        } as Response);
      }
      if (urlStr.includes("/v1/dashboard/study-time")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-st",
              thisWeek: {
                seconds: 16500,
                minutes: 275,
                formatted: "۴ ساعت و ۳۵ دقیقه",
              },
              lastWeek: {
                seconds: 13200,
                minutes: 220,
                formatted: "۳ ساعت و ۴۰ دقیقه",
              },
              changePercent: 25,
              daily: [],
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [] }),
      } as Response);
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
      expect(screen.getByText("۴ ساعت و ۳۵ دقیقه")).toBeInTheDocument();
    });

    expect(screen.getByText(/۲۵٪ نسبت به هفته قبل/)).toBeInTheDocument();
  });
});
