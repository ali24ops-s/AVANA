import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { FlashcardsPage } from "../pages/FlashcardsPage.js";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "student@example.com" },
    memberships: [{ organization_id: "org-123", role: "organization_admin" }],
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Flashcards Exam Mode Disabled / Coming Soon (شب امتحان)", () => {
  const mockOrgId = "org-123";

  beforeEach(() => {
    vi.restoreAllMocks();
    mockNavigate.mockReset();
  });

  const setupMockFetch = () => {
    const fetchedUrls: string[] = [];
    const fetchCalls: { url: string; body?: any }[] = [];

    global.fetch = vi.fn().mockImplementation((url: any, init?: any) => {
      const actualUrl = typeof url === "string" ? url : url.url;
      fetchedUrls.push(actualUrl);
      let parsedBody: any;
      try {
        if (init?.body) {
          parsedBody = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
        }
      } catch {}
      fetchCalls.push({ url: actualUrl, body: parsedBody, init });

      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary") && !url.includes("study-sessions")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-orgs",
            items: [{ id: mockOrgId, name: "Health Org" }],
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-summary",
            courses: [
              {
                course_id: "course-1",
                title: "Cardiology",
                total_cards: 25,
                due_cards: 5,
                new_cards: 10,
                modules: [
                  { module_id: "mod-1", title: "Arrhythmia", total_cards: 25 },
                ],
              },
            ],
            total_due: 5,
            total_new: 10,
            total_cards: 25,
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-sessions`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-session",
            session: { id: "session-123", mode: "daily" },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });

    return { fetchedUrls, fetchCalls };
  };

  it("renders 'شب امتحان' card with 'به‌زودی' badge and aria-disabled state", async () => {
    setupMockFetch();
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("شب امتحان")).toBeInTheDocument();
    });

    // Check that the Coming Soon badge is present and visible
    expect(screen.getByText("به‌زودی")).toBeInTheDocument();

    // Check that the tile container has aria-disabled="true"
    const examTitle = screen.getByText("شب امتحان");
    const examCard = examTitle.closest("[aria-disabled='true']");
    expect(examCard).not.toBeNull();
    expect(examCard).toHaveAttribute("aria-disabled", "true");
  });

  it("clicking 'شب امتحان' tile does not activate exam mode, limits do not appear, and study button stays on daily", async () => {
    const { fetchCalls } = setupMockFetch();
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("شب امتحان")).toBeInTheDocument();
    });

    // Attempt to click the disabled Exam tile
    const examCard = screen.getByText("شب امتحان").closest("[aria-disabled='true']");
    expect(examCard).not.toBeNull();
    fireEvent.click(examCard!);

    // Exam limit controls (20, 50, 100, 200, all) must NOT be rendered
    expect(screen.queryByText("محدودیت:")).toBeNull();

    // Start study button must remain "شروع مطالعه" (daily SRS) and NOT "شروع مرور فشرده امتحان"
    expect(screen.getByText("شروع مطالعه")).toBeInTheDocument();
    expect(screen.queryByText("شروع مرور فشرده امتحان")).toBeNull();

    // Click start study button
    const startButton = screen.getByRole("button", { name: /شروع مطالعه/i });
    fireEvent.click(startButton);

    await waitFor(() => {
      // Must initiate session with method POST and mode === 'daily' (never 'exam')
      const postCalls = fetchCalls.filter(
        (c) => c.url.includes("/study/flashcard-sessions") && c.init?.method === "POST",
      );
      expect(postCalls.length).toBeGreaterThan(0);
      expect(postCalls[0].body?.mode).toBe("daily");
    });
  });
});
