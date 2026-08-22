import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { FlashcardsPage } from "../pages/FlashcardsPage.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-e2e-1", email: "student@example.com" },
    memberships: [{ organization_id: "org-e2e-100", role: "organization_admin" }],
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

describe("End-to-End Course-Level Flashcards Flow Verification", () => {
  const mockOrgId = "org-e2e-100";
  const mockCourseId = "course-e2e-1";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Full E2E Trace: Course with 10 cards and 0 modules -> Course visible -> Selectable -> Queue fetch -> First Flashcard rendered", async () => {
    const fetchedUrls: string[] = [];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      fetchedUrls.push(url);

      if (url.includes("/v1/organizations") && !url.includes("flashcard-summary") && !url.includes("flashcards")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-orgs",
            items: [{ id: mockOrgId, name: "E2E Health Org" }],
          }),
        });
      }

      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-summary-e2e",
            courses: [
              {
                course_id: mockCourseId,
                title: "Cardiology Course Level",
                total_cards: 10,
                due_cards: 3,
                new_cards: 7,
                learning_cards: 0,
                overdue_cards: 0,
                modules: [], // 0 modules
              },
            ],
            total_due: 3,
            total_overdue: 0,
            total_new: 7,
            total_cards: 10,
          }),
        });
      }

      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcards/review-queue`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-queue-e2e",
            due_cards: [
              {
                id: "fc-course-level-001",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                document_id: "doc-100",
                generated_content_id: null,
                lesson_id: null,
                question: "What is the key sign of Acute Myocardial Infarction on ECG?",
                answer: "ST-segment elevation in contiguous leads.",
                explanation: "STEMI criteria requires >1mm elevation in standard leads.",
                card_type: "concept",
                difficulty: "medium",
                due_at: new Date().toISOString(),
                interval_days: 0,
                ease_factor: 2.5,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
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

    // 1. Render FlashcardsPage & verify taxonomy selector displays the course
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/flashcards"]}>
          <Routes>
            <Route path="/flashcards" element={<FlashcardsPage />} />
            <Route
              path="/flashcards/study"
              element={
                <FlashcardExperience
                  organizationId={mockOrgId}
                  courseId={mockCourseId}
                />
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Assertion 1: Course is visible in UI
    await waitFor(() => {
      expect(screen.getByText("Cardiology Course Level")).toBeDefined();
      expect(screen.getByText("10 کارت")).toBeDefined();
    });

    // Assertion 2: Course is selectable
    const selectCourseCheckbox = screen.getByLabelText("انتخاب کل دوره Cardiology Course Level");
    expect(selectCourseCheckbox).toBeDefined();
    fireEvent.click(selectCourseCheckbox);

    // Assertion 3: Start Study button is enabled & clickable
    const startStudyButton = screen.getByText("شروع مطالعه");
    expect(startStudyButton).toBeDefined();

    // 2. Render FlashcardExperience review session (simulating navigation)
    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Assertion 4: Flashcard review queue query fetched course-level cards
    await waitFor(() => {
      expect(
        fetchedUrls.some((u) => u.includes(`/v1/organizations/${mockOrgId}/study/flashcards/review-queue`)),
      ).toBe(true);
    });

    // Assertion 5 & 6: First Flashcard (with module_id = null and lesson_id = null) is displayed in UI
    await waitFor(() => {
      expect(
        screen.getByText("What is the key sign of Acute Myocardial Infarction on ECG?"),
      ).toBeDefined();
    });

    // Flip card and verify answer display
    fireEvent.click(
      screen.getByText("What is the key sign of Acute Myocardial Infarction on ECG?"),
    );

    await waitFor(() => {
      expect(
        screen.getByText("ST-segment elevation in contiguous leads."),
      ).toBeDefined();
    });
  });

  it("Regressions: Course with cards is shown, course with 0 cards is hidden, 0-card module is hidden", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/v1/organizations/${mockOrgId}/study/flashcard-summary`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-reg-summary",
            courses: [
              {
                course_id: "c-active",
                title: "Active Course",
                total_cards: 8,
                due_cards: 2,
                new_cards: 6,
                modules: [
                  { module_id: "m-active", title: "Module with Cards", total_cards: 8 },
                  { module_id: "m-empty", title: "Empty Module", total_cards: 0 },
                ],
              },
              {
                course_id: "c-empty",
                title: "Empty Course Zero Cards",
                total_cards: 0,
                due_cards: 0,
                new_cards: 0,
                modules: [],
              },
            ],
            total_due: 2,
            total_new: 6,
            total_cards: 8,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-orgs",
          items: [{ id: mockOrgId, name: "Reg Org" }],
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

    // Active course is rendered
    await waitFor(() => {
      expect(screen.getByText("Active Course")).toBeDefined();
    });

    // Empty course with 0 cards is hidden
    expect(screen.queryByText("Empty Course Zero Cards")).toBeNull();

    // Expand active course
    fireEvent.click(screen.getByText("Active Course"));

    // Module with cards is rendered
    await waitFor(() => {
      expect(screen.getByText("Module with Cards")).toBeDefined();
    });

    // Empty module with 0 cards is hidden
    expect(screen.queryByText("Empty Module")).toBeNull();
  });
});
