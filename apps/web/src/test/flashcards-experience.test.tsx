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
    expect(screen.getByText(/^[6۶]$/)).toBeDefined();
    expect(screen.getByText("پایان‌یافته:")).toBeDefined();
    expect(screen.getByText(/^[4۴]$/)).toBeDefined();
  });

  it("prevents double submission and shows error banner on failed review request without skipping card", async () => {
    let submitCallCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
      if (opts?.method === "POST" && url.includes("/review")) {
        submitCallCount++;
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: { message: "Internal server error" } }),
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
                question: "Card 1 Question",
                answer: "Card 1 Answer",
                explanation: null,
                card_type: "concept",
                difficulty: "easy",
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
        json: async () => ({
          request_id: "req-summary",
          courses: [{ course_id: mockCourseId, title: "Course 1", total_cards: 1, due_cards: 1 }],
          total_cards: 1,
          total_due: 1,
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
      expect(screen.getByText("Card 1 Question")).toBeDefined();
    });

    // Flip card
    fireEvent.click(screen.getByText("Card 1 Question"));

    await waitFor(() => {
      expect(screen.getByText("Card 1 Answer")).toBeDefined();
    });

    const goodBtn = screen.getByRole("button", { name: /خوب/i });
    fireEvent.click(goodBtn);

    // After failure, error banner should appear and the card should NOT advance
    await waitFor(() => {
      expect(screen.getByText(/خطا در ثبت بازخورد مرور/i)).toBeDefined();
      expect(screen.getByText("Card 1 Answer")).toBeDefined();
    });
    expect(submitCallCount).toBe(1);
  });

  it("dynamically displays scheduler intervals on Again/Hard/Good/Easy buttons for reviewed cards", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/review-queue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            due_cards: [
              {
                id: "card-reviewed",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                document_id: "doc-1",
                generated_content_id: null,
                question: "Reviewed Question",
                answer: "Reviewed Answer",
                explanation: null,
                card_type: "concept",
                difficulty: "medium",
                due_at: new Date().toISOString(),
                interval_days: 4,
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
          request_id: "req-summary",
          courses: [{ course_id: mockCourseId, title: "Course 1", total_cards: 1, due_cards: 1 }],
          total_cards: 1,
          total_due: 1,
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
      expect(screen.getByText("Reviewed Question")).toBeDefined();
    });

    // Flip card
    fireEvent.click(screen.getByText("Reviewed Question"));

    await waitFor(() => {
      expect(screen.getByText("Reviewed Answer")).toBeDefined();
    });

    // For interval_days: 4 and ease_factor: 2.5:
    // Again -> < ۱۰ دقیقه
    // Hard -> Math.round(4 * 1.2) = 5 روز
    // Good -> Math.round(4 * 2.5) = 10 روز
    // Easy -> Math.round(4 * 2.5 * 1.3) = 13 روز
    expect(screen.getByText("< ۱۰ دقیقه")).toBeDefined();
    expect(screen.getByText("۵ روز")).toBeDefined();
    expect(screen.getByText("۱۰ روز")).toBeDefined();
    expect(screen.getByText("۱۳ روز")).toBeDefined();
  });

  it("handles camelCase raw card responses and resolves courseId without failing review submission", async () => {
    let submittedUrl = "";
    let submittedBody: any = null;

    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string; body?: string }) => {
      if (opts?.method === "POST") {
        submittedUrl = url;
        submittedBody = opts?.body ? JSON.parse(opts.body) : null;
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
                id: "card-camel-1",
                organizationId: mockOrgId,
                courseId: mockCourseId,
                documentId: "doc-1",
                question: "CamelCase Question",
                answer: "CamelCase Answer",
                intervalDays: 2,
                easeFactor: 2.5,
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-summary",
          courses: [{ course_id: mockCourseId, title: "Course 1" }],
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
      expect(screen.getByText("CamelCase Question")).toBeDefined();
    });

    // Flip card
    fireEvent.click(screen.getByText("CamelCase Question"));

    await waitFor(() => {
      expect(screen.getByText("CamelCase Answer")).toBeDefined();
    });

    // For intervalDays = 2, easeFactor = 2.5:
    // Again -> < ۱۰ دقیقه
    // Hard -> Math.round(2 * 1.2) = 2 -> ۲ روز
    // Good -> Math.round(2 * 2.5) = 5 -> ۵ روز
    // Easy -> Math.round(2 * 2.5 * 1.3) = 7 -> ۷ روز
    expect(screen.getByText("< ۱۰ دقیقه")).toBeDefined();
    expect(screen.getByText("۲ روز")).toBeDefined();
    expect(screen.getByText("۵ روز")).toBeDefined();
    expect(screen.getByText("۷ روز")).toBeDefined();

    // Click Good
    fireEvent.click(screen.getByText("خوب"));

    await waitFor(() => {
      expect(submittedUrl).toContain(`/courses/${mockCourseId}/flashcards/card-camel-1/review`);
      expect(submittedBody).toEqual({ rating: "good", reaction_ms: expect.any(Number), is_exam_mode: false });
    });
  });

  it("displays correct interval hints for New Cards (interval_days: 0) where Hard and Good are both 1 day", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/review-queue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            due_cards: [
              {
                id: "card-new-1",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                document_id: "doc-1",
                question: "New Card Question",
                answer: "New Card Answer",
                interval_days: 0,
                ease_factor: 2.5,
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-summary",
          courses: [{ course_id: mockCourseId, title: "Course 1" }],
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
      expect(screen.getByText("New Card Question")).toBeDefined();
    });

    // Flip card
    fireEvent.click(screen.getByText("New Card Question"));

    await waitFor(() => {
      expect(screen.getByText("New Card Answer")).toBeDefined();
    });

    // For interval_days: 0:
    // Again -> < ۱۰ دقیقه
    // Hard -> ۱ روز
    // Good -> ۱ روز
    // Easy -> ۲ روز
    expect(screen.getByText("< ۱۰ دقیقه")).toBeDefined();
    expect(screen.getAllByText("۱ روز").length).toBe(2);
    expect(screen.getByText("۲ روز")).toBeDefined();
  });

  it("Test D & E: loads study session with reviewed card (interval: 4), displays derived intervals (Hard: 5d, Good: 10d, Easy: 13d), submits Hard successfully and advances", async () => {
    let reviewSubmitted = false;
    let submittedPayload: any = null;

    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string; body?: string }) => {
      if (opts?.method === "POST" && url.includes("/review")) {
        reviewSubmitted = true;
        submittedPayload = opts?.body ? JSON.parse(opts.body) : null;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-rev-1", success: true }),
        });
      }
      if (opts?.method === "PATCH" && url.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-prog-1", session: { current_index: 1 } }),
        });
      }
      if (url.includes("/study/flashcard-sessions/session-456")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-sess",
            session: {
              id: "session-456",
              status: "in_progress",
              total_cards: 2,
              completed_cards: 0,
              current_index: 0,
            },
            cards: [
              {
                id: "card-rev-4",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                document_id: "doc-1",
                question: "Card with Interval 4",
                answer: "Answer 4",
                interval_days: 4,
                ease_factor: 2.5,
              },
              {
                id: "card-rev-5",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                document_id: "doc-1",
                question: "Second Card",
                answer: "Answer 5",
                interval_days: 6,
                ease_factor: 2.5,
              },
            ],
            session_cards: [
              { id: "sc-1", flashcard_id: "card-rev-4", sort_order: 0, status: "unseen" },
              { id: "sc-2", flashcard_id: "card-rev-5", sort_order: 1, status: "unseen" },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-summary",
          courses: [{ course_id: mockCourseId, title: "Course 1" }],
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience
          organizationId={mockOrgId}
          sessionId="session-456"
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Card with Interval 4")).toBeDefined();
    });

    // Flip card
    fireEvent.click(screen.getByText("Card with Interval 4"));

    await waitFor(() => {
      expect(screen.getByText("Answer 4")).toBeDefined();
    });

    // Test D: Verify interval hints derived from SRS scheduler:
    // interval: 4, ease: 2.5
    // Again -> < ۱۰ دقیقه
    // Hard -> Math.round(4 * 1.2) = 5 روز
    // Good -> Math.round(4 * 2.5) = 10 روز
    // Easy -> Math.round(4 * 2.5 * 1.3) = 13 روز
    expect(screen.getByText("< ۱۰ دقیقه")).toBeDefined();
    expect(screen.getByText("۵ روز")).toBeDefined();
    expect(screen.getByText("۱۰ روز")).toBeDefined();
    expect(screen.getByText("۱۳ روز")).toBeDefined();

    // Test E: Click Hard
    fireEvent.click(screen.getByText("سخت"));

    await waitFor(() => {
      expect(reviewSubmitted).toBe(true);
      expect(submittedPayload.rating).toBe("hard");
      // Advances to second card
      expect(screen.getByText("Second Card")).toBeDefined();
    });

    // Verify no error banner was displayed
    expect(screen.queryByText("خطا در ثبت بازخورد")).toBeNull();
  });
});
