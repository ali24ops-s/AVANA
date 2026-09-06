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

  it("renders review summary with document-level categories and estimated reading time", async () => {
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

    // Verify 6 document-level category containers are rendered
    expect(screen.getByText(/نکات کلیدی و مفاهیم اصلی/)).toBeDefined();
    expect(screen.getByText(/مکانیسم‌های سلولی \/ مولکولی/)).toBeDefined();
    expect(screen.getByText(/دسته‌بندی و طبقه‌بندی ساختاری/)).toBeDefined();
    expect(screen.getByText(/مقایسه‌ها و تفاوت‌های کلیدی \(Key Distinctions\)/)).toBeDefined();
    expect(screen.getByText(/نکات حفظی و اعداد مهم/)).toBeDefined();
    expect(screen.getByText(/نکات مهم و پرتکرار آزمونی/)).toBeDefined();

    // Verify content items
    expect(screen.getByText(/کاپتوپریل و انالاپریل/)).toBeDefined();
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

  it("flattens 3 sections with comparisons into ONE single Key Distinctions container and does not render micro-section headings", async () => {
    const multiSectionPayload: ReviewSummaryPayload = {
      kind: "review_summary",
      title: "فارماکولوژی جامع",
      estimatedReadingMinutes: 15,
      overview: "مرور جامع ۳ بخش دارویی",
      sections: [
        {
          title: "بخش ۱: مسدودکننده‌های بتا",
          keyPoints: ["پروپرانولول غیرانتخابی"],
          comparisons: [
            {
              conceptA: "Propranolol",
              conceptB: "Metoprolol",
              keyDifferences: "پروپرانولول غیراختصاصی است ولی متوپرولول بتا-۱ اختصاصی است.",
            },
          ],
        },
        {
          title: "بخش ۲: دیورتیک‌ها",
          keyPoints: ["فورزماید دیورتیک لوپ"],
          comparisons: [
            {
              conceptA: "Furosemide",
              conceptB: "Hydrochlorothiazide",
              keyDifferences: "فورزماید اثر مهاری قوی‌تری بر بازجذب سدیم در قوس هنله دارد.",
            },
          ],
        },
        {
          title: "بخش ۳: مهارکننده‌های کانال کلسیم",
          keyPoints: ["وراپامیل و آملودیپین"],
          comparisons: [
            {
              conceptA: "Verapamil",
              conceptB: "Amlodipine",
              keyDifferences: "وراپامیل بر میوکارد اثر غالب دارد ولی آملودیپین بر عروق محیطی انتخابی‌تر است.",
            },
          ],
        },
      ],
      finalTakeaways: ["جمع‌بندی نهایی ۳ بخش"],
      citationChunkIds: ["chunk-1"],
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/review-summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            content: {
              id: "content-2",
              type: "review_summary",
              payload: multiSectionPayload,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReviewSummaryViewer
          organizationId={mockOrgId}
          documentId={mockDocId}
          courseId={mockCourseId}
          documentTitle="cardio_all.pdf"
        />
      </QueryClientProvider>,
    );

    // Wait for render
    await waitFor(() => {
      expect(screen.getByText(/فارماکولوژی جامع/)).toBeDefined();
    });

    // 1. Key Distinctions heading appears EXACTLY ONCE
    const distinctionHeadings = screen.getAllByText(/مقایسه‌ها و تفاوت‌های کلیدی \(Key Distinctions\)/);
    expect(distinctionHeadings.length).toBe(1);

    // 2. All 3 comparisons from the 3 sections are rendered within that single container
    expect(screen.getByText(/Propranolol/)).toBeDefined();
    expect(screen.getByText(/Metoprolol/)).toBeDefined();
    expect(screen.getByText(/Furosemide/)).toBeDefined();
    expect(screen.getByText(/Hydrochlorothiazide/)).toBeDefined();
    expect(screen.getByText(/Verapamil/)).toBeDefined();
    expect(screen.getByText(/Amlodipine/)).toBeDefined();

    // 3. Section titles are NOT rendered as headings
    expect(screen.queryByText(/بخش ۱: مسدودکننده‌های بتا/)).toBeNull();
    expect(screen.queryByText(/بخش ۲: دیورتیک‌ها/)).toBeNull();
    expect(screen.queryByText(/بخش ۳: مهارکننده‌های کانال کلسیم/)).toBeNull();

    // 4. Key points from all 3 sections are merged in the Key Points category
    const keyPointsHeadings = screen.getAllByText(/نکات کلیدی و مفاهیم اصلی/);
    expect(keyPointsHeadings.length).toBe(1);
    expect(screen.getByText(/پروپرانولول غیرانتخابی/)).toBeDefined();
    expect(screen.getByText(/فورزماید دیورتیک لوپ/)).toBeDefined();
    expect(screen.getByText(/وراپامیل و آملودیپین/)).toBeDefined();
  });

  it("omits empty categories when sections contain no items for them", async () => {
    const sparsePayload: ReviewSummaryPayload = {
      kind: "review_summary",
      title: "نکات خلاصه کوتاه",
      estimatedReadingMinutes: 5,
      sections: [
        {
          title: "بخش تست",
          keyPoints: ["تنها یک نکته کلیدی"],
          examPoints: ["یک نکته امتحانی مهم"],
        },
      ],
      citationChunkIds: ["chunk-1"],
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/review-summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            content: {
              id: "content-3",
              type: "review_summary",
              payload: sparsePayload,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ReviewSummaryViewer
          organizationId={mockOrgId}
          documentId={mockDocId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/نکات خلاصه کوتاه/)).toBeDefined();
    });

    // Populated categories MUST exist
    expect(screen.getByText(/نکات کلیدی و مفاهیم اصلی/)).toBeDefined();
    expect(screen.getByText(/تنها یک نکته کلیدی/)).toBeDefined();
    expect(screen.getByText(/نکات مهم و پرتکرار آزمونی/)).toBeDefined();
    expect(screen.getByText(/یک نکته امتحانی مهم/)).toBeDefined();

    // Empty categories MUST NOT exist
    expect(screen.queryByText(/مکانیسم‌های سلولی \/ مولکولی/)).toBeNull();
    expect(screen.queryByText(/دسته‌بندی و طبقه‌بندی ساختاری/)).toBeNull();
    expect(screen.queryByText(/مقایسه‌ها و تفاوت‌های کلیدی \(Key Distinctions\)/)).toBeNull();
    expect(screen.queryByText(/نکات حفظی و اعداد مهم/)).toBeNull();
  });
});
