import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
});
