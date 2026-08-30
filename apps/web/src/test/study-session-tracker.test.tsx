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

  it("renders dynamic study time and change percentage on Dashboard (thisWeek > 0, lastWeek > 0)", async () => {
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

    expect(screen.getByText(/↑ ۲۵٪ نسبت به هفته قبل/)).toBeInTheDocument();
  });

  it("displays last week study time without percentage change when thisWeek = 0 and lastWeek > 0", async () => {
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
                seconds: 0,
                minutes: 0,
                formatted: "۰ دقیقه",
              },
              lastWeek: {
                seconds: 15600,
                minutes: 260,
                formatted: "۴ ساعت و ۲۰ دقیقه",
              },
              changePercent: null,
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
      expect(screen.getByText("۰ دقیقه")).toBeInTheDocument();
    });

    // Should display last week study time
    expect(screen.getByText("هفته قبل: ۴ ساعت و ۲۰ دقیقه")).toBeInTheDocument();
    // Should NOT display percentage change or drop indicators
    expect(screen.queryByText(/نسبت به هفته قبل/)).not.toBeInTheDocument();
    expect(screen.queryByText(/۱۰۰٪/)).not.toBeInTheDocument();
  });

  it("Integration test: 100 minutes last week and 0 minutes this week -> displays 'هفته قبل: ۱ ساعت و ۴۰ دقیقه' without ↓ 99% or any reduction %", async () => {
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
                seconds: 0,
                minutes: 0,
                formatted: "۰ دقیقه",
              },
              lastWeek: {
                seconds: 6000,
                minutes: 100,
                formatted: "۱ ساعت و ۴۰ دقیقه",
              },
              changePercent: null,
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
      expect(screen.getByText("۰ دقیقه")).toBeInTheDocument();
    });

    // Exact output required
    expect(screen.getByText("هفته قبل: ۱ ساعت و ۴۰ دقیقه")).toBeInTheDocument();

    // Must NOT contain 99% or 100% or any reduction arrow
    expect(screen.queryByText(/۹۹٪/)).not.toBeInTheDocument();
    expect(screen.queryByText(/۱۰۰٪/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
    expect(screen.queryByText(/نسبت به هفته قبل/)).not.toBeInTheDocument();
  });

  it("Integration test: 100 minutes last week and 20s sub-minute noise this week -> displays 'هفته قبل: ۱ ساعت و ۴۰ دقیقه' without ↓ 99%", async () => {
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
                seconds: 20,
                minutes: 0,
                formatted: "۰ دقیقه",
              },
              lastWeek: {
                seconds: 6000,
                minutes: 100,
                formatted: "۱ ساعت و ۴۰ دقیقه",
              },
              changePercent: null,
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
      expect(screen.getByText("۰ دقیقه")).toBeInTheDocument();
    });

    // Exact output required
    expect(screen.getByText("هفته قبل: ۱ ساعت و ۴۰ دقیقه")).toBeInTheDocument();

    // Must NOT contain 99% or 100% or any reduction arrow
    expect(screen.queryByText(/۹۹٪/)).not.toBeInTheDocument();
    expect(screen.queryByText(/۱۰۰٪/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
    expect(screen.queryByText(/نسبت به هفته قبل/)).not.toBeInTheDocument();
  });

  it("displays appropriate empty message when thisWeek = 0 and lastWeek = 0", async () => {
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
                seconds: 0,
                minutes: 0,
                formatted: "۰ دقیقه",
              },
              lastWeek: {
                seconds: 0,
                minutes: 0,
                formatted: "۰ دقیقه",
              },
              changePercent: null,
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
      expect(screen.getByText("۰ دقیقه")).toBeInTheDocument();
    });

    expect(screen.getByText("هفته قبل: هنوز مطالعه‌ای ثبت نشده")).toBeInTheDocument();
    expect(screen.queryByText(/نسبت به هفته قبل/)).not.toBeInTheDocument();
  });

  it("Case 5 / 10 (exact 50%): allows percentage comparison and displays ↓ 50%", async () => {
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
                seconds: 18000,
                minutes: 300,
                formatted: "۵ ساعت",
              },
              lastWeek: {
                seconds: 36000,
                minutes: 600,
                formatted: "۱۰ ساعت",
              },
              changePercent: -50,
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
      expect(screen.getByText("۵ ساعت")).toBeInTheDocument();
    });

    expect(screen.getByText("↓ ۵۰٪ نسبت به هفته قبل")).toBeInTheDocument();
  });

  it("Case 4 / 10 (< 50%): displays last week study time without reduction percentage", async () => {
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
                seconds: 14400,
                minutes: 240,
                formatted: "۴ ساعت",
              },
              lastWeek: {
                seconds: 36000,
                minutes: 600,
                formatted: "۱۰ ساعت",
              },
              changePercent: -60,
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
      expect(screen.getByText("۴ ساعت")).toBeInTheDocument();
    });

    expect(screen.getByText("هفته قبل: ۱۰ ساعت")).toBeInTheDocument();
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
    expect(screen.queryByText(/۶۰٪/)).not.toBeInTheDocument();
  });

  it("Real DB scenario: thisWeek = 317s (5m) and lastWeek = 29326s (8h 8m) -> displays 'هفته قبل: ۸ ساعت و ۸ دقیقه' without ↓ 99%", async () => {
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
              user: { id: "u-1", email: "ali1383mohammadlo@gmail.com", role: "student" },
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
                seconds: 317,
                minutes: 5,
                formatted: "۵ دقیقه",
              },
              lastWeek: {
                seconds: 29326,
                minutes: 489,
                formatted: "۸ ساعت و ۸ دقیقه",
              },
              changePercent: -99,
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
      expect(screen.getByText("۵ دقیقه")).toBeInTheDocument();
    });

    expect(screen.getByText("هفته قبل: ۸ ساعت و ۸ دقیقه")).toBeInTheDocument();
    expect(screen.queryByText(/۹۹٪/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
    expect(screen.queryByText(/نسبت به هفته قبل/)).not.toBeInTheDocument();
  });

  it("Case 10 / 10: displays 'مشابه هفته قبل' when thisWeek equals lastWeek", async () => {
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
                seconds: 36000,
                minutes: 600,
                formatted: "۱۰ ساعت",
              },
              lastWeek: {
                seconds: 36000,
                minutes: 600,
                formatted: "۱۰ ساعت",
              },
              changePercent: 0,
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
      expect(screen.getByText("۱۰ ساعت")).toBeInTheDocument();
    });

    expect(screen.getByText("مشابه هفته قبل")).toBeInTheDocument();
  });

  it("Case 12 / 10: displays '↑ ۲۰٪ نسبت به هفته قبل'", async () => {
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
                seconds: 43200,
                minutes: 720,
                formatted: "۱۲ ساعت",
              },
              lastWeek: {
                seconds: 36000,
                minutes: 600,
                formatted: "۱۰ ساعت",
              },
              changePercent: 20,
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
      expect(screen.getByText("۱۲ ساعت")).toBeInTheDocument();
    });

    expect(screen.getByText("↑ ۲۰٪ نسبت به هفته قبل")).toBeInTheDocument();
  });

  it("displays 'شروع شد 🌱' when thisWeek > 0 and lastWeek = 0 without NaN/Infinity", async () => {
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
                seconds: 3600,
                minutes: 60,
                formatted: "۱ ساعت",
              },
              lastWeek: {
                seconds: 0,
                minutes: 0,
                formatted: "۰ دقیقه",
              },
              changePercent: null,
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
      expect(screen.getByText("۱ ساعت")).toBeInTheDocument();
    });

    expect(screen.getByText("شروع شد 🌱")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Infinity/)).not.toBeInTheDocument();
    expect(screen.queryByText(/نسبت به هفته قبل/)).not.toBeInTheDocument();
  });
});
