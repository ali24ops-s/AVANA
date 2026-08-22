import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Flashcard Experience Flow", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });


  it("renders empty queue state when no cards are due", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/review-queue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-1", due_cards: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-2", flashcards: [], next_review_count: 0 }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مرور کارت‌ها به پایان رسید!")).toBeDefined();
      expect(screen.getByText(/در حال حاضر کارتی برای مرور زمان‌بندی نشده است/i)).toBeDefined();
    });
  });

  it("renders due card, flips, and submits rating", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-rev", success: true }),
        });
      }
      if (url.includes("/review-queue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            due_cards: [
              {
                id: "card-1",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                document_id: "doc-1",
                generated_content_id: null,
                question: "What is the primary mechanism of action of ACE inhibitors?",
                answer: "Block ACE enzyme, reducing Angiotensin II.",
                explanation: "Prevents conversion of AT-I to AT-II.",
                card_type: "mechanism",
                difficulty: "medium",
                due_at: new Date().toISOString(),
                interval_days: 1,
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
        json: async () => ({
          request_id: "req-2",
          flashcards: [{ id: "card-1" }],
          next_review_count: 1,
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("What is the primary mechanism of action of ACE inhibitors?"),
      ).toBeDefined();
    });

    // Flip card
    fireEvent.click(
      screen.getByText("What is the primary mechanism of action of ACE inhibitors?"),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Block ACE enzyme, reducing Angiotensin II."),
      ).toBeDefined();
      expect(screen.getByText("خوب")).toBeDefined();
    });

    // Submit rating
    fireEvent.click(screen.getByText("خوب"));

    await waitFor(() => {
      expect(screen.getByText("جلسه مرور با موفقیت به پایان رسید!")).toBeDefined();
    });
  });

  it("accurately resumes study session at index 4 with hydrated counters: 4 reviewed, 6 unseen", async () => {
    const mockSessionId = "session-123";
    const totalCards = 10;
    const cards = Array.from({ length: totalCards }, (_, i) => ({
      id: `card-${i + 1}`,
      organization_id: mockOrgId,
      course_id: mockCourseId,
      document_id: "doc-1",
      generated_content_id: null,
      question: `Question ${i + 1}`,
      answer: `Answer ${i + 1}`,
      explanation: `Explanation ${i + 1}`,
      card_type: "definition",
      difficulty: "medium",
      due_at: new Date().toISOString(),
      interval_days: 0,
      ease_factor: 2.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const sessionCards = Array.from({ length: totalCards }, (_, i) => ({
      id: `sc-${i + 1}`,
      session_id: mockSessionId,
      flashcard_id: `card-${i + 1}`,
      sort_order: i,
      status: i < 4 ? "reviewed" : "unseen",
      rating: i < 4 ? "good" : null,
      reviewed_at: i < 4 ? new Date().toISOString() : null,
    }));

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/flashcard-sessions/${mockSessionId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-detail",
            session: {
              id: mockSessionId,
              organization_id: mockOrgId,
              user_id: "user-1",
              title: "مطالعه داروشناسی",
              mode: "daily",
              status: "in_progress",
              total_cards: 10,
              completed_cards: 4,
              current_index: 4,
              current_card_id: "card-5",
              created_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString(),
              completed_at: null,
            },
            cards,
            session_cards: sessionCards,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-summary",
          courses: [{ course_id: mockCourseId, title: "فارماکولوژی", total_cards: 10, due_cards: 6 }],
          total_cards: 10,
          total_due: 6,
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience
          organizationId={mockOrgId}
          sessionId={mockSessionId}
        />
      </QueryClientProvider>,
    );

    // Assert that card 5 (Question 5) is visible, NOT Question 1
    await waitFor(() => {
      expect(screen.getByText("Question 5")).toBeDefined();
    });
    expect(screen.queryByText("Question 1")).toBeNull();

    // Assert that counters show: unseen: 6, finished: 4
    expect(screen.getByText("دیده‌نشده:")).toBeDefined();
    expect(screen.getByText("6")).toBeDefined();
    expect(screen.getByText("پایان‌یافته:")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
  });
});
