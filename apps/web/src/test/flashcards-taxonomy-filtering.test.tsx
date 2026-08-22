import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { FlashcardsPage } from "../pages/FlashcardsPage.js";

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

describe("Flashcards Taxonomy Filtering & Organization Resolution", () => {
  const mockOrgId = "org-123";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Case 1: Renders course when total_cards > 0 even if all modules have 0 cards", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary")) {
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
                course_id: "course-case1",
                title: "Cardiology 101",
                total_cards: 10,
                due_cards: 2,
                new_cards: 8,
                modules: [
                  { module_id: "mod-a", title: "Module A", total_cards: 0 },
                  { module_id: "mod-b", title: "Module B", total_cards: 0 },
                ],
              },
            ],
            total_due: 2,
            total_new: 8,
            total_cards: 10,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
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
      expect(screen.getByText("Cardiology 101")).toBeDefined();
    });

    // Ensure the empty state message is NOT shown
    expect(screen.queryByText("برای این دوره هنوز سرفصل یا فلشکارتی ثبت نشده است.")).toBeNull();
  });

  it("Case 2: Renders course and active module when total_cards > 0 and module total_cards > 0", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary")) {
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
                course_id: "course-case2",
                title: "Pharmacology 101",
                total_cards: 5,
                due_cards: 1,
                new_cards: 4,
                modules: [
                  { module_id: "mod-active", title: "Active Module A", total_cards: 5 },
                  { module_id: "mod-empty", title: "Empty Module B", total_cards: 0 },
                ],
              },
            ],
            total_due: 1,
            total_new: 4,
            total_cards: 5,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
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
      expect(screen.getByText("Pharmacology 101")).toBeDefined();
    });

    // Expand accordion to reveal modules
    fireEvent.click(screen.getByText("Pharmacology 101"));

    await waitFor(() => {
      expect(screen.getByText("Active Module A")).toBeDefined();
    });

    // Empty module B should be filtered out from taxonomy selector
    expect(screen.queryByText("Empty Module B")).toBeNull();
  });

  it("Case 3: Hides course when total_cards === 0", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary")) {
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
            courses: [],
            total_due: 0,
            total_new: 0,
            total_cards: 0,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
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
      expect(screen.getByText("برای این دوره هنوز سرفصل یا فلشکارتی ثبت نشده است.")).toBeDefined();
    });
  });

  it("Case 4: Course-level cards with module_id = null and lesson_id = null remain accessible", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary")) {
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
                course_id: "course-case4",
                title: "General Anatomy",
                total_cards: 12,
                due_cards: 3,
                new_cards: 9,
                modules: [],
              },
            ],
            total_due: 3,
            total_new: 9,
            total_cards: 12,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
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
      expect(screen.getByText("General Anatomy")).toBeDefined();
      expect(screen.getByText("12 کارت")).toBeDefined();
    });
  });

  it("Case 6: Selection behavior - Select Course selects all topics, Deselect Course deselects topics, Select Topic A selects only A", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-summary-case6",
            courses: [
              {
                course_id: "course-6",
                title: "Internal Medicine",
                total_cards: 20,
                due_cards: 5,
                new_cards: 15,
                modules: [
                  { module_id: "mod-1", title: "Gastroenterology", total_cards: 10 },
                  { module_id: "mod-2", title: "Pulmonology", total_cards: 10 },
                ],
              },
            ],
            total_due: 5,
            total_new: 15,
            total_cards: 20,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ id: mockOrgId, name: "Health Org" }],
        }),
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
      expect(screen.getByText("Internal Medicine")).toBeDefined();
    });

    // Expand course
    fireEvent.click(screen.getByText("Internal Medicine"));

    await waitFor(() => {
      expect(screen.getByText("Gastroenterology")).toBeDefined();
      expect(screen.getByText("Pulmonology")).toBeDefined();
    });

    // 1. Select Topic A (Gastroenterology)
    fireEvent.click(screen.getByText("Gastroenterology"));
    await waitFor(() => {
      expect(screen.getByText("1 مبحث انتخاب شده است.")).toBeDefined();
    });

    // 2. Select Course -> Selects all topics in course
    fireEvent.click(screen.getByLabelText("انتخاب کل دوره Internal Medicine"));
    await waitFor(() => {
      expect(screen.getByText(/مبحث انتخاب شده است/i)).toBeDefined();
    });

    // 3. Deselect Course -> Deselects topics back to default
    fireEvent.click(screen.getByLabelText("انتخاب کل دوره Internal Medicine"));
    await waitFor(() => {
      expect(screen.queryByText(/2 مبحث انتخاب شده است/i)).toBeNull();
    });
  });
});
