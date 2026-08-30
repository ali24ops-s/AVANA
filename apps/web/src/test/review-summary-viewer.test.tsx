import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewSummaryViewer } from "../components/documents/ReviewSummaryViewer.js";
import type { ReviewSummaryPayload } from "@avana/domain";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("ReviewSummaryViewer Component", () => {
  const mockOrgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
  const mockCourseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e";
  const mockDocId = "a2a8caed-5f6c-460a-8324-3802c176bf46";

  const mockPayload: ReviewSummaryPayload = {
    kind: "review_summary",
    title: "خلاصه مروری فارماکولوژی قلب و عروق",
    estimatedReadingMinutes: 12,
    overview: "خلاصه فوق‌العاده فشرده از داروهای کاهنده فشار خون و پاتوفیزیولوژی قلبی.",
    sections: [
      {
        title: "مهارکننده‌های سیستم رنین-آنژیوتانسین (ACEIs & ARBs)",
        keyPoints: [
          "کاپتوپریل و انالاپریل از تبدیل آنژیوتانسین ۱ به ۲ جلوگیری می‌کنند.",
          "لوزارتان مستقیماً گیرنده AT1 را مسدود می‌کند.",
        ],
        mechanisms: ["مهار تبدیل آنژیوتانسین I به II و کاهش سطح آلدوسترون."],
        classifications: ["دسته داروهای مهارکننده آنزیم مبدل آنژیوتانسین (ACE)"],
        comparisons: [
          {
            conceptA: "ACE Inhibitors",
            conceptB: "ARBs",
            keyDifferences: "مهارکننده‌های ACE باعث تجمع برادی‌کینین و سرفه خشک می‌شوند در حالی که ARBs فاقد این عارضه هستند.",
          },
        ],
        memorizationPoints: ["کنترااندیکاسیون مطلق: بارداری (تراتوژنیسیتی قطعی)"],
        examPoints: ["نکته تست‌خیز: عدم تجویز همزمان با مکمل‌های پتاسیم به دلیل خطر هیپرکالمی شدید."],
        citationChunkIds: ["chunk-1"],
      },
    ],
    finalTakeaways: [
      "تثبیت تفاوت‌های عوارض جانبی ACEI در مقایسه با ARB قبل از آزمون ضروری است.",
    ],
    citationChunkIds: ["chunk-1"],
    targetReadingMinutes: 12,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders review summary with header badges and estimated reading time", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/review-summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            content: {
              id: "content-1",
              type: "review_summary",
              payload: mockPayload,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const onFlashcards = vi.fn();
    const onQuiz = vi.fn();

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReviewSummaryViewer
          organizationId={mockOrgId}
          documentId={mockDocId}
          courseId={mockCourseId}
          documentTitle="cardio.pdf"
          onNavigateToFlashcards={onFlashcards}
          onNavigateToQuiz={onQuiz}
        />
      </QueryClientProvider>,
    );

    // Verify title and badges
    await waitFor(() => {
      expect(screen.getByText(/خلاصه مروری فارماکولوژی قلب و عروق/)).toBeDefined();
    });

    expect(screen.getByText(/زمان مطالعه تقریبی: ۱۲ دقیقه/)).toBeDefined();
    expect(screen.getByText(/مناسب برای: مرور سریع قبل از آزمون/)).toBeDefined();
    expect(screen.getByText(/خلاصه یک‌دقیقه‌ای/)).toBeDefined();
    expect(screen.getByText(/مهارکننده‌های سیستم رنین-آنژیوتانسین/)).toBeDefined();
    expect(screen.getByText(/مهارکننده‌های ACE باعث تجمع برادی‌کینین/)).toBeDefined();
    expect(screen.getByText(/بارداری \(تراتوژنیسیتی قطعی\)/)).toBeDefined();
    expect(screen.getByText(/خطر هیپرکالمی شدید/)).toBeDefined();

    // Verify interactive transitions
    const fcBtn = screen.getByText(/شروع فلش‌کارت‌های این مبحث/);
    fireEvent.click(fcBtn);
    expect(onFlashcards).toHaveBeenCalled();

    const quizBtn = screen.getByText(/آزمون سریع این درس/);
    fireEvent.click(quizBtn);
    expect(onQuiz).toHaveBeenCalled();
  });

  it("renders empty state with generate CTA when no review summary exists", async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-1",
          content: null,
        }),
      };
    });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReviewSummaryViewer
          organizationId={mockOrgId}
          documentId={mockDocId}
          courseId={mockCourseId}
          documentTitle="cardio.pdf"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/خلاصه مروری هنوز برای این فایل تولید نشده است/),
      ).toBeDefined();
    });

    expect(
      screen.getByText(/تولید خلاصه مروری با هوش مصنوعی/),
    ).toBeDefined();
  });
});
