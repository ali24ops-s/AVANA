import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { FlashcardsPage } from "../pages/FlashcardsPage.js";

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "alice@example.com" },
    memberships: [{ organization_id: "org-real-uuid-12345", role: "organization_admin" }],
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

describe("FlashcardsPage Organization Resolution", () => {
  const mockRealOrgId = "org-real-uuid-12345";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches organizations dynamically and uses the real organization ID for flashcards summary", async () => {
    const fetchedUrls: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url);
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-orgs",
            items: [{ id: mockRealOrgId, name: "Real Seeded Org" }],
            pagination: { limit: 1, next_cursor: null },
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockRealOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-summary",
            courses: [
              {
                course_id: "course-1",
                title: "Pharmacology Basics",
                total_cards: 10,
                due_cards: 2,
                new_cards: 5,
                overdue_cards: 1,
              },
            ],
            total_due: 2,
            total_overdue: 1,
            total_new: 5,
          }),
        });
      }
      if (url.includes(`/v1/organizations/${mockRealOrgId}/documents`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-docs",
            items: [],
            pagination: { limit: 10, next_cursor: null },
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({ code: "not_found", message: "Not found" }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مطالعه فشرده برای امتحان")).toBeDefined();
    });

    // Click on exam mode to reveal course cards
    const examCard = screen.getByText("مطالعه فشرده برای امتحان");
    examCard.click();

    await waitFor(() => {
      expect(screen.getByText("Pharmacology Basics")).toBeDefined();
    });

    // Ensure NO request was made to dummy UUID '00000000-0000-0000-0000-000000000010'
    const dummyRequests = fetchedUrls.filter((u) => u.includes("00000000-0000-0000-0000-000000000010"));
    expect(dummyRequests.length).toBe(0);

    // Ensure request WAS made to real org ID
    const realOrgRequests = fetchedUrls.filter((u) => u.includes(mockRealOrgId));
    expect(realOrgRequests.length).toBeGreaterThan(0);
  });
});
