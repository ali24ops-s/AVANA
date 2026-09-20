import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { ReviewPage } from "../pages/ReviewPage.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "student@example.com", name: "دانشجو" },
    memberships: [{ organization_id: "org-1", role: "student" }],
    isLoading: false,
    error: null,
    signOut: vi.fn(),
  }),
}));

// Mock Commerce hooks
vi.mock("../hooks/useCommerce.js", () => ({
  useMySubscription: () => ({
    data: { subscription: { status: "active", expires_at: new Date(Date.now() + 86400000).toISOString() } },
    isLoading: false,
  }),
}));

describe("Flashcards Fullscreen & Header-Hidden Review Mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("AuthenticatedShell hides header on /flashcards/review and renders Outlet directly", () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/flashcards/review?sessionId=session-1"]}>
          <Routes>
            <Route element={<AuthenticatedShell />}>
              <Route path="/flashcards/review" element={<div data-testid="review-content">محتوای مرور فلش‌کارت</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Review content should be rendered
    expect(screen.getByTestId("review-content")).toBeInTheDocument();

    // Shell header navigation links should NOT be rendered in review mode
    expect(screen.queryByLabelText("منوی اصلی")).not.toBeInTheDocument();
    expect(screen.queryByText("خانه")).not.toBeInTheDocument();
  });

  it("AuthenticatedShell displays header on regular pages like /flashcards and /courses", () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/flashcards"]}>
          <Routes>
            <Route element={<AuthenticatedShell />}>
              <Route path="/flashcards" element={<div data-testid="flashcards-config">تنظیمات فلش‌کارت</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Regular flashcard configuration page still has shell header
    expect(screen.getByTestId("flashcards-config")).toBeInTheDocument();
    expect(screen.getByLabelText("منوی اصلی")).toBeInTheDocument();
    expect(screen.getByText("خانه")).toBeInTheDocument();
  });

  it("ReviewPage renders full viewport container (100dvh) with card, progress, stats, and SRS controls", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/review-queue") || url.includes("/exam-queue") || url.includes("/custom-queue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            due_cards: [
              {
                id: "card-1",
                question: "سوال فلش‌کارت تستی",
                answer: "پاسخ فلش‌کارت تستی",
                interval_days: 0,
                ease_factor: 2.5,
              },
            ],
          }),
        });
      }
      if (url.includes("/flashcards/summary") || url.includes("/summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ total_cards: 1, total_due: 1, total_new: 1 }),
        });
      }
      if (url.endsWith("/organizations") || url.includes("/organizations?")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ items: [{ id: "org-1", title: "سازمان آزمایشی" }] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });

    const queryClient = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/flashcards/review"]}>
          <ReviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // The question should appear
    expect(await screen.findByText("سوال فلش‌کارت تستی")).toBeInTheDocument();

    // Progress bar with card counter should be visible
    expect(screen.getByText("کارت ۱ از ۱")).toBeInTheDocument();

    // Review statistics pill should be visible
    expect(screen.getByText("دیده‌نشده:")).toBeInTheDocument();
    expect(screen.getByText("مرور مجدد:")).toBeInTheDocument();
    expect(screen.getByText("پایان‌یافته:")).toBeInTheDocument();

    // SRS rating buttons container should be visible
    expect(screen.getByText("دوباره")).toBeInTheDocument();
    expect(screen.getByText("سخت")).toBeInTheDocument();
    expect(screen.getByText("خوب")).toBeInTheDocument();
    expect(screen.getByText("آسان")).toBeInTheDocument();

    // Check that outer container has full-screen overflow-hidden classes
    const outerContainer = container.firstChild as HTMLElement;
    expect(outerContainer.className).toContain("h-screen");
    expect(outerContainer.className).toContain("overflow-hidden");
  });
});
