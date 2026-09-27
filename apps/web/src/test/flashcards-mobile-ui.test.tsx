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

describe("Flashcard Mobile UI & Desktop Preservation", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const mockCards = [
    {
      id: "card-1",
      organization_id: mockOrgId,
      course_id: mockCourseId,
      document_id: "doc-1",
      generated_content_id: null,
      question: "سوال ۱",
      answer: "پاسخ ۱",
      explanation: "توضیح ۱",
      card_type: "concept",
      difficulty: "medium",
      due_at: new Date().toISOString(),
      interval_days: 1,
      ease_factor: 2.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "card-2",
      organization_id: mockOrgId,
      course_id: mockCourseId,
      document_id: "doc-1",
      generated_content_id: null,
      question: "سوال ۲",
      answer: "پاسخ ۲",
      explanation: "توضیح ۲",
      card_type: "concept",
      difficulty: "medium",
      due_at: new Date().toISOString(),
      interval_days: 1,
      ease_factor: 2.5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it("renders square/non-rounded SRS buttons on mobile (rounded-none) and rounded-xl on desktop", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/review-queue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-1", due_cards: mockCards }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-2", flashcards: mockCards, next_review_count: 2 }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience organizationId={mockOrgId} courseId={mockCourseId} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("سوال ۱")).toBeDefined();
    });

    const againBtn = screen.getByLabelText("تکرار");
    const hardBtn = screen.getByLabelText("سخت");
    const goodBtn = screen.getByLabelText("خوب");
    const easyBtn = screen.getByLabelText("آسان");

    // All 4 buttons must have rounded-none for mobile and sm:rounded-xl for desktop
    expect(againBtn.className).toContain("rounded-none");
    expect(againBtn.className).toContain("sm:rounded-xl");
    expect(againBtn.className).toContain("min-h-[48px]");

    expect(hardBtn.className).toContain("rounded-none");
    expect(hardBtn.className).toContain("sm:rounded-xl");
    expect(hardBtn.className).toContain("min-h-[48px]");

    expect(goodBtn.className).toContain("rounded-none");
    expect(goodBtn.className).toContain("sm:rounded-xl");
    expect(goodBtn.className).toContain("min-h-[48px]");

    expect(easyBtn.className).toContain("rounded-none");
    expect(easyBtn.className).toContain("sm:rounded-xl");
    expect(easyBtn.className).toContain("min-h-[48px]");
  });

  it("renders mobile navigation buttons inside the flashcard with proper positioning and desktop buttons preserved", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/review-queue")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-1", due_cards: mockCards }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-2", flashcards: mockCards, next_review_count: 2 }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience organizationId={mockOrgId} courseId={mockCourseId} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("سوال ۱")).toBeDefined();
    });

    // The navigation buttons now exist inside the card only
    const nextButtons = screen.getAllByLabelText("کارت بعدی");
    expect(nextButtons.length).toBe(1);

    const prevButtons = screen.getAllByLabelText("کارت قبلی");
    expect(prevButtons.length).toBe(1);

    // Check buttons are inside #flashcard
    const flashcardEl = document.getElementById("flashcard")!;
    expect(flashcardEl).toBeDefined();

    const mobilePrevBtn = prevButtons[0];
    const mobileNextBtn = nextButtons[0];

    expect(flashcardEl.contains(mobilePrevBtn)).toBe(true);
    expect(flashcardEl.contains(mobileNextBtn)).toBe(true);

    // 1. Next button click when unflipped flips card
    fireEvent.click(mobileNextBtn);

    await waitFor(() => {
      expect(screen.getByText("پاسخ ۱")).toBeDefined();
    });

    // 2. Mobile next button click when flipped advances to card 2
    fireEvent.click(mobileNextBtn!);

    await waitFor(() => {
      expect(screen.getByText("سوال ۲")).toBeDefined();
    });

    // 3. Test mobile previous button click navigates back to card 1
    fireEvent.click(mobilePrevBtn!);

    await waitFor(() => {
      expect(screen.getByText("سوال ۱")).toBeDefined();
    });
  });

  const mobileViewports = [320, 360, 375, 390, 414];
  mobileViewports.forEach((width) => {
    it(`renders cleanly on mobile viewport ${width}px without breaking layout or buttons`, async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/review-queue")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-1",
              due_cards: [
                {
                  id: "card-long",
                  organization_id: mockOrgId,
                  course_id: mockCourseId,
                  document_id: "doc-1",
                  generated_content_id: null,
                  question: "این یک متن طولانی برای تست رفتار فلش‌کارت در صفحات با عرض کم است که شامل توضیحات مبسوط و متون چند خطی می‌باشد.",
                  answer: "این یک پاسخ بسیار مفصل و طولانی است که شامل چندین نکته مهم و مفاهیم تکمیلی برای یادگیری است.",
                  explanation: "توضیح تکمیلی درباره ساختار و عملکرد الگوریتم مرور فاصله‌دار در شرایط مختلف.",
                  card_type: "concept",
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
          json: async () => ({ request_id: "req-2", flashcards: [{ id: "card-long" }], next_review_count: 1 }),
        });
      });

      // Set window innerWidth
      window.innerWidth = width;
      window.dispatchEvent(new Event("resize"));

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <FlashcardExperience organizationId={mockOrgId} courseId={mockCourseId} />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/این یک متن طولانی/)).toBeDefined();
      });

      const againBtn = screen.getByLabelText("تکرار");
      expect(againBtn.className).toContain("rounded-none");

      // Verify mobile navigation arrows exist in the card
      const flashcardEl = document.getElementById("flashcard")!;
      const mobileNavPrev = screen.getAllByLabelText("کارت قبلی").find((btn) => flashcardEl.contains(btn));
      const mobileNavNext = screen.getAllByLabelText("کارت بعدی").find((btn) => flashcardEl.contains(btn));

      expect(mobileNavPrev).toBeDefined();
      expect(mobileNavNext).toBeDefined();
    });
  });
});
