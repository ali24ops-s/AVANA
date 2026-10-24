import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewSummaryViewer } from "../components/documents/ReviewSummaryViewer.js";
import type { ReviewSummaryPayload } from "@avana/domain";
import type { UserMembership, UserResource } from "@avana/contracts";

let mockAuth: {
  user: Partial<UserResource> | null;
  memberships: Partial<UserMembership>[];
  isAuthenticated: boolean;
} = {
  user: { id: "user-1", email: "user@avana.ir", role: "organization_admin" },
  memberships: [
    { organization_id: "b4a0b464-16db-4087-92b7-163a1e6f6776", role: "organization_admin" },
  ],
  isAuthenticated: true,
};

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => mockAuth,
}));

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
    mockAuth = {
      user: { id: "user-1", email: "user@avana.ir", role: "organization_admin" },
      memberships: [
        { organization_id: "b4a0b464-16db-4087-92b7-163a1e6f6776", role: "organization_admin" },
      ],
      isAuthenticated: true,
    };
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

    // Verify topic section heading is rendered without repetitive subheadings
    expect(screen.getByText(/مهارکننده‌های سیستم رنین-آنژیوتانسین/)).toBeDefined();
    expect(screen.queryByText("نکات کلیدی")).toBeNull();
    expect(screen.queryByText("مکانیسم‌ها")).toBeNull();
    expect(screen.queryByText("طبقه‌بندی‌ها")).toBeNull();
    expect(screen.queryByText("مقایسه‌ها و تفاوت‌های کلیدی")).toBeNull();
    expect(screen.queryByText("نکات حفظی و اعداد مهم")).toBeNull();
    expect(screen.queryByText("نکات مهم آزمونی")).toBeNull();

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

  it("renders distinct topic sections independently with their actual titles and in original order", async () => {
    const multiSectionPayload: ReviewSummaryPayload = {
      kind: "review_summary",
      title: "فارماکولوژی جامع",
      estimatedReadingMinutes: 15,
      overview: "مرور جامع ۳ بخش دارویی",
      sections: [
        {
          title: "بخش ۱: مسدودکننده‌های بتا",
          keyPoints: ["پروپرانولول غیرانتخابی"],
          mechanisms: ["مسدودسازی گیرنده‌های بتا-۱ و بتا-۲"],
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
          classifications: ["لوپ، تیازید، نگهدارنده پتاسیم"],
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
          memorizationPoints: ["وراپامیل در نارسایی قلبی ممنوع است"],
          examPoints: ["نکته تست: وراپامیل و دیگوکسین تداخل دارند"],
          comparisons: ["مقایسه ساده دی‌هیدروپیریدین‌ها با غیر دی‌هیدروپیریدین‌ها"],
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

    // 1. All topic section titles MUST be rendered
    const title1 = screen.getByText("بخش ۱: مسدودکننده‌های بتا");
    const title2 = screen.getByText("بخش ۲: دیورتیک‌ها");
    const title3 = screen.getByText("بخش ۳: مهارکننده‌های کانال کلسیم");
    expect(title1).toBeDefined();
    expect(title2).toBeDefined();
    expect(title3).toBeDefined();

    // 2. Section order strictly preserves original array order
    expect(Boolean(title1.compareDocumentPosition(title2) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(title2.compareDocumentPosition(title3) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    // 3. Optional fields rendered under their respective topic without leaking
    expect(screen.getByText("مسدودسازی گیرنده‌های بتا-۱ و بتا-۲")).toBeDefined();
    expect(screen.getByText("لوپ، تیازید، نگهدارنده پتاسیم")).toBeDefined();
    expect(screen.getByText("وراپامیل در نارسایی قلبی ممنوع است")).toBeDefined();
    expect(screen.getByText("نکته تست: وراپامیل و دیگوکسین تداخل دارند")).toBeDefined();

    // 4. Structured comparison (conceptA vs conceptB) & string comparison both rendered
    expect(screen.getByText("Propranolol")).toBeDefined();
    expect(screen.getByText("Metoprolol")).toBeDefined();
    expect(screen.getByText(/پروپرانولول غیراختصاصی است/)).toBeDefined();
    expect(screen.getByText("مقایسه ساده دی‌هیدروپیریدین‌ها با غیر دی‌هیدروپیریدین‌ها")).toBeDefined();

    // 5. All key points rendered under their sections without content loss
    expect(screen.getByText("پروپرانولول غیرانتخابی")).toBeDefined();
    expect(screen.getByText("فورزماید دیورتیک لوپ")).toBeDefined();
    expect(screen.getByText("وراپامیل و آملودیپین")).toBeDefined();
  });

  it("renders section with only keyPoints without optional fields or empty subheadings", async () => {
    const keyPointsOnlyPayload: ReviewSummaryPayload = {
      kind: "review_summary",
      title: "خلاصه مبحث ساده",
      estimatedReadingMinutes: 4,
      sections: [
        {
          title: "بخش فقط حاوی نکات کلیدی",
          keyPoints: ["نکته کلیدی نخست", "نکته کلیدی دوم"],
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
              id: "content-kp-only",
              type: "review_summary",
              payload: keyPointsOnlyPayload,
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
      expect(screen.getByText("بخش فقط حاوی نکات کلیدی")).toBeDefined();
    });

    expect(screen.queryByText("نکات کلیدی")).toBeNull();
    expect(screen.getByText("نکته کلیدی نخست")).toBeDefined();
    expect(screen.getByText("نکته کلیدی دوم")).toBeDefined();

    // Optional section subheadings MUST NOT be rendered
    expect(screen.queryByText("مکانیسم‌ها")).toBeNull();
    expect(screen.queryByText("طبقه‌بندی‌ها")).toBeNull();
    expect(screen.queryByText("مقایسه‌ها و تفاوت‌های کلیدی")).toBeNull();
    expect(screen.queryByText("نکات حفظی و اعداد مهم")).toBeNull();
    expect(screen.queryByText("نکات مهم آزمونی")).toBeNull();
  });

  it("handles legacy and sparse summaries gracefully", async () => {
    const legacyPayload: ReviewSummaryPayload = {
      kind: "review_summary",
      title: "خلاصه قدیمی بدون فیلدهای نهایی",
      estimatedReadingMinutes: 6,
      overview: "بررسی خلاصه‌های قدیمی بدون تیک‌اوی یا با آرایه‌های خالی",
      sections: [
        {
          title: "فصل اول قدیمی",
          keyPoints: ["نکته قدیمی"],
          mechanisms: [],
          classifications: [],
          comparisons: [],
          memorizationPoints: [],
          examPoints: [],
        },
      ],
      finalTakeaways: [],
      citationChunkIds: [],
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/review-summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-legacy",
            content: {
              id: "content-legacy",
              type: "review_summary",
              payload: legacyPayload,
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
      expect(screen.getByText("خلاصه قدیمی بدون فیلدهای نهایی")).toBeDefined();
    });

    expect(screen.getByText("فصل اول قدیمی")).toBeDefined();
    expect(screen.getByText("نکته قدیمی")).toBeDefined();
    // Empty subheadings should not be rendered
    expect(screen.queryByText("مکانیسم‌ها")).toBeNull();
    expect(screen.queryByText("طبقه‌بندی‌ها")).toBeNull();
    expect(screen.queryByText("جمع‌بندی نهایی و نکات کلیدی (Final Takeaways)")).toBeNull();
  });

  describe("Role-based Generation Visibility & Access Control", () => {
    it("admin/editor sees regenerate button and clicking it sends POST with { force: true }", async () => {
      mockAuth = {
        user: { id: "admin-1", email: "admin@avana.ir", role: "course_editor" },
        memberships: [{ organization_id: mockOrgId, role: "course_editor" }],
        isAuthenticated: true,
      };

      const fetchCalls: { url: string; options?: RequestInit }[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        fetchCalls.push({ url: String(url), options });
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

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ReviewSummaryViewer
            organizationId={mockOrgId}
            documentId={mockDocId}
            courseId={mockCourseId}
          />
        </QueryClientProvider>,
      );

      const regenerateBtn = await screen.findByRole("button", { name: /به‌روزرسانی خلاصه/i });
      expect(regenerateBtn).toBeInTheDocument();

      fireEvent.click(regenerateBtn);

      await waitFor(() => {
        const postCall = fetchCalls.find(
          (c) =>
            c.url.includes(`/courses/${mockCourseId}/documents/${mockDocId}/review-summary`) &&
            c.options?.method === "POST",
        );
        expect(postCall).toBeDefined();
        expect(JSON.parse(postCall?.options?.body as string)).toEqual({ force: true });
      });
    });

    it("student/user: regenerate button is NOT rendered, existing summary renders unchanged, and no POST mutation is possible", async () => {
      mockAuth = {
        user: { id: "student-1", email: "student@avana.ir", role: "student" },
        memberships: [{ organization_id: mockOrgId, role: "student" }],
        isAuthenticated: true,
      };

      const fetchCalls: { url: string; options?: RequestInit }[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        fetchCalls.push({ url: String(url), options });
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

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ReviewSummaryViewer
            organizationId={mockOrgId}
            documentId={mockDocId}
            courseId={mockCourseId}
          />
        </QueryClientProvider>,
      );

      // 1. Summary content renders completely
      await waitFor(() => {
        expect(screen.getByText(/خلاصه مروری فارماکولوژی قلب و عروق/)).toBeInTheDocument();
      });
      expect(screen.getByText(/زمان مطالعه تقریبی: ۱۲ دقیقه/)).toBeInTheDocument();
      expect(screen.getByText(/خلاصه یک‌دقیقه‌ای/)).toBeInTheDocument();
      expect(screen.getByText(/کاپتوپریل و انالاپریل/)).toBeInTheDocument();

      // 2. Regenerate button is NOT rendered
      expect(screen.queryByRole("button", { name: /به‌روزرسانی خلاصه/i })).toBeNull();
      expect(screen.queryByText(/به‌روزرسانی خلاصه/)).toBeNull();

      // 3. No POST request was made
      const postCalls = fetchCalls.filter((c) => c.options?.method === "POST");
      expect(postCalls.length).toBe(0);
    });

    it("student/user: empty state does NOT render any generation button/action", async () => {
      mockAuth = {
        user: { id: "student-1", email: "student@avana.ir", role: "student" },
        memberships: [],
        isAuthenticated: true,
      };

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-1",
          content: null,
        }),
      }));

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
        expect(screen.getByText(/خلاصه مروری هنوز برای این فایل تولید نشده است/)).toBeInTheDocument();
      });

      // No generation action button in empty state for student
      expect(screen.queryByRole("button", { name: /تولید خلاصه مروری/i })).toBeNull();
      expect(screen.queryByText(/تولید خلاصه مروری/)).toBeNull();
      expect(screen.queryByRole("button", { name: /به‌روزرسانی خلاصه/i })).toBeNull();
    });

    it("admin/editor: empty state allows generation with { force: true }", async () => {
      mockAuth = {
        user: { id: "admin-1", email: "admin@avana.ir", role: "course_editor" },
        memberships: [{ organization_id: mockOrgId, role: "course_editor" }],
        isAuthenticated: true,
      };

      const fetchCalls: { url: string; options?: RequestInit }[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        fetchCalls.push({ url: String(url), options });
        if (String(url).includes("/review-summary")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-1",
              content: null,
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

      const generateBtn = await screen.findByRole("button", {
        name: /تولید خلاصه مروری با هوش مصنوعی/i,
      });
      expect(generateBtn).toBeInTheDocument();

      fireEvent.click(generateBtn);

      await waitFor(() => {
        const postCall = fetchCalls.find(
          (c) =>
            c.url.includes(`/courses/${mockCourseId}/documents/${mockDocId}/review-summary`) &&
            c.options?.method === "POST",
        );
        expect(postCall).toBeDefined();
        expect(JSON.parse(postCall?.options?.body as string)).toEqual({ force: true });
      });
    });

    it("student/user: error retry button only triggers GET /refetch and never calls POST mutation", async () => {
      mockAuth = {
        user: { id: "student-1", email: "student@avana.ir", role: "student" },
        memberships: [],
        isAuthenticated: true,
      };

      let queryAttempts = 0;
      const fetchCalls: { url: string; options?: RequestInit }[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        fetchCalls.push({ url: String(url), options });
        if (String(url).includes("/review-summary")) {
          queryAttempts++;
          if (queryAttempts === 1) {
            return {
              ok: false,
              status: 500,
              json: async () => ({ message: "خطای سرور آزمایشی" }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-2",
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

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ReviewSummaryViewer
            organizationId={mockOrgId}
            documentId={mockDocId}
            courseId={mockCourseId}
          />
        </QueryClientProvider>,
      );

      const retryBtn = await screen.findByRole("button", { name: /تلاش مجدد/i });
      expect(retryBtn).toBeInTheDocument();

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(queryAttempts).toBeGreaterThanOrEqual(2);
      });

      // Crucial: absolutely no POST call was made
      const postCalls = fetchCalls.filter((c) => c.options?.method === "POST");
      expect(postCalls.length).toBe(0);
    });

    it("admin/editor: error retry button executes generation mutation with POST { force: true }", async () => {
      mockAuth = {
        user: { id: "admin-1", email: "admin@avana.ir", role: "organization_admin" },
        memberships: [{ organization_id: mockOrgId, role: "organization_admin" }],
        isAuthenticated: true,
      };

      const fetchCalls: { url: string; options?: RequestInit }[] = [];
      global.fetch = vi.fn().mockImplementation(async (url: string, options?: RequestInit) => {
        fetchCalls.push({ url: String(url), options });
        if (String(url).includes("/review-summary")) {
          if (options?.method === "POST") {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                request_id: "req-post",
                content: {
                  id: "content-post",
                  type: "review_summary",
                  payload: mockPayload,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              }),
            };
          }
          return {
            ok: false,
            status: 500,
            json: async () => ({ message: "خطای سرور" }),
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

      const retryBtn = await screen.findByRole("button", { name: /تلاش مجدد/i });
      expect(retryBtn).toBeInTheDocument();

      fireEvent.click(retryBtn);

      await waitFor(() => {
        const postCall = fetchCalls.find(
          (c) =>
            c.url.includes(`/courses/${mockCourseId}/documents/${mockDocId}/review-summary`) &&
            c.options?.method === "POST",
        );
        expect(postCall).toBeDefined();
        expect(JSON.parse(postCall?.options?.body as string)).toEqual({ force: true });
      });
    });

    it("renders locked paywall state when 403 Forbidden is returned without generation options", async () => {
      mockAuth = {
        user: { id: "student-1", email: "student@avana.ir", role: "student" },
        memberships: [],
        isAuthenticated: true,
      };

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          error: "forbidden",
          message: "خلاصه مروری این فصل مخصوص نسخه کامل دوره است (403)",
        }),
      }));

      const onUnlock = vi.fn();
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ReviewSummaryViewer
            organizationId={mockOrgId}
            documentId={mockDocId}
            courseId={mockCourseId}
            onUnlock={onUnlock}
          />
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText(/خلاصه مروری این فصل قفل است/)).toBeInTheDocument();
      });

      const unlockBtn = screen.getByRole("button", { name: /مشاهده تعرفه‌ها و خرید دوره/i });
      expect(unlockBtn).toBeInTheDocument();
      fireEvent.click(unlockBtn);
      expect(onUnlock).toHaveBeenCalled();

      // No generation buttons rendered
      expect(screen.queryByText(/به‌روزرسانی خلاصه/)).toBeNull();
      expect(screen.queryByText(/تولید خلاصه مروری/)).toBeNull();
    });

    it("renders loading state gracefully", () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ReviewSummaryViewer
            organizationId={mockOrgId}
            documentId={mockDocId}
            courseId={mockCourseId}
          />
        </QueryClientProvider>,
      );

      expect(screen.getByText(/در حال بارگذاری خلاصه مروری\.\.\./)).toBeInTheDocument();
    });
  });

  describe("Standard Educational Dimensions Rendering", () => {
    it("renders اشتباه رایج and کاربرد بالینی and Markdown tables with high-fidelity formatting", async () => {
      const educationalPayload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "خلاصه فارماکولوژی بالینی",
        estimatedReadingMinutes: 8,
        overview: "بررسی جامع مهارکننده‌های ACE و عوارض بالینی.",
        sections: [
          {
            title: "فارماکودینامیک و عوارض جانبی",
            keyPoints: [
              "کاربرد بالینی: داروی خط اول در بیماران دیابتی مبتلا به پروتئینوری.",
              "اشتباه رایج: سرفه ناشی از مهارکننده ACE با آنتی‌هیستامین برطرف می‌شود ← این باور نادرست است زیرا سرفه ناشی از تجمع برادی‌کینین است نه هیستامین ← درمان قطع دارو و جایگزینی با ARB است.",
              "| ویژگی | انالاپریل | لوزارتان |\n| --- | --- | --- |\n| رده | ACEI | ARB |\n| سرفه | دارد | ندارد |",
            ],
            examPoints: [
              "نکته آزمونی: کنترااندیکاسیون قطعی در تنگی دوطرفه شریان کلیه.",
            ],
            citationChunkIds: ["chunk-1"],
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
              request_id: "req-edu",
              content: {
                id: "content-edu-1",
                type: "review_summary",
                payload: educationalPayload,
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
        expect(screen.getByText("فارماکودینامیک و عوارض جانبی")).toBeInTheDocument();
      });

      // Verify clinical use item
      expect(screen.getByText(/داروی خط اول در بیماران دیابتی/)).toBeInTheDocument();

      // Verify misconception item
      expect(screen.getByText(/سرفه ناشی از مهارکننده ACE با آنتی‌هیستامین برطرف می‌شود/)).toBeInTheDocument();

      // Verify exam point
      expect(screen.getByText(/کنترااندیکاسیون قطعی در تنگی دوطرفه شریان کلیه/)).toBeInTheDocument();

      // Verify table headers & cells
      expect(screen.getByText("ویژگی")).toBeInTheDocument();
      expect(screen.getByText("انالاپریل")).toBeInTheDocument();
      expect(screen.getByText("لوزارتان")).toBeInTheDocument();
    });
  });

  describe("Unified Educational Document Structure", () => {
    it("renders as a single continuous article document rather than disjoint section cards, with consolidated golden exam points", async () => {
      const unifiedDocPayload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "فارماکولوژی ضد انعقاد و ترومبولیتیک",
        estimatedReadingMinutes: 10,
        overview: "نمای کلی هپارین، وارفارین و مهارکننده‌های مستقیم فاکتور Xa.",
        sections: [
          {
            title: "هپارین و LMWH",
            keyPoints: [
              "کاربرد بالینی: پیشگیری و درمان ترومبوز وریدهای عمقی (DVT).",
              "اشتباه رایج: اثر ضد انعقادی هپارین وابسته به آنتی‌ترومبین III نیست ← این باور غلط است، زیرا بدون AT-III فعالیت ناچیز دارد.",
            ],
            mechanisms: ["اتصال به آنتی‌ترومبین III ← فعال‌سازی مهار ترومبین و فاکتور Xa"],
            examPoints: ["نکته آزمونی: آنتی‌دوت هپارین، پروتامین سولفات است."],
          },
          {
            title: "وارفارین و تداخلات",
            keyPoints: ["مهار ویتامین K اپوکساید ردوکتاز"],
            mechanisms: ["مهار گاما-کربوکسیلاسیون فاکتورهای II, VII, IX, X"],
            examPoints: ["نکته آزمونی: سنجش اثر با PT/INR و منع مصرف در بارداری به دلیل تراتوژنیسیتی."],
          },
        ],
        finalTakeaways: ["مقایسه مسیر پایش هپارین (aPTT) و وارفارین (PT/INR) برای آزمون حیاتی است."],
        citationChunkIds: ["chunk-1"],
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes("/review-summary")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-unified-1",
              content: {
                id: "content-unified-1",
                type: "review_summary",
                payload: unifiedDocPayload,
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

      // 1. Single article document container exists
      const docArticle = await screen.findByTestId("review-summary-document");
      expect(docArticle).toBeInTheDocument();
      expect(docArticle.tagName.toLowerCase()).toBe("article");

      // 2. Both section headings are within this article
      expect(screen.getByText("هپارین و LMWH")).toBeInTheDocument();
      expect(screen.getByText("وارفارین و تداخلات")).toBeInTheDocument();

      // 3. Consolidated Golden Exam Points section rendered at the bottom of the document
      const goldenExamHeading = screen.getByText("نکات طلایی امتحانی");
      expect(goldenExamHeading).toBeInTheDocument();
      expect(docArticle.contains(goldenExamHeading)).toBe(true);

      // 4. All exam points collected under the golden exam points section
      expect(screen.getByText(/آنتی‌دوت هپارین، پروتامین سولفات است/)).toBeInTheDocument();
      expect(screen.getByText(/سنجش اثر با PT\/INR و منع مصرف در بارداری/)).toBeInTheDocument();

      // 5. Final takeaways rendered inside the document
      const takeawaysHeading = screen.getByText(/جمع‌بندی نهایی و نکات کلیدی/);
      expect(takeawaysHeading).toBeInTheDocument();
      expect(docArticle.contains(takeawaysHeading)).toBe(true);
    });

    it("renders comprehensive multi-column tables with math formulas, English terms, and isolated horizontal scrolling without bullets", async () => {
      const tablePayload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "همودینامیک و بیوانرژتیک قلب",
        estimatedReadingMinutes: 10,
        overview: "مرور محاسبات فشار شریانی و ترمودینامیک انقباض قلبی.",
        sections: [
          {
            title: "جدول پارامترهای همودینامیک و فرمول‌ها",
            keyPoints: [
              "پارامترهای حیاتی قلبی و تعاریف ریاضی آنها:",
              "| شاخص | نماد و فرمول | مقدار نرمال | اهمیت بالینی |\n" +
                "| --- | --- | --- | --- |\n" +
                "| فشار متوسط شریانی | MAP = DP + 1/3 PP | ۷۰ تا ۱۰۵ mmHg | شاخص پرفیوژن ارگان‌های حیاتی مغز و کلیه |\n" +
                "| برون‌ده قلبی | CO = HR × SV | ۴ تا ۸ L/min | تعیین‌کننده کفایت اکسیژن‌رسانی بافتی |\n" +
                "| مقاومت عروق محیطی | SVR | ۸۰۰ تا ۱۲۰۰ dynes | تعیین‌کننده پس‌بار بطن چپ |",
              "نکته تکمیلی: فشار پرفیوژن کرونری مستقیماً به فشار دیاستولی وابسته است.",
            ],
            examPoints: ["نکته آزمونی: حداقل MAP برای حفظ پرفیوژن کلیوی ۶۵ میلی‌متر جیوه است."],
          },
        ],
        finalTakeaways: ["محاسبه MAP و هدف‌گذاری بالای ۶۵ در شوک سپتیک اولویت نخست است."],
        citationChunkIds: ["chunk-hemo-1"],
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes("/review-summary")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-table-ui-1",
              content: {
                id: "content-table-ui-1",
                type: "review_summary",
                payload: tablePayload,
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

      // Verify table headers are rendered
      expect(await screen.findByText("شاخص")).toBeInTheDocument();
      expect(screen.getByText("نماد و فرمول")).toBeInTheDocument();
      expect(screen.getByText("مقدار نرمال")).toBeInTheDocument();
      expect(screen.getByText("اهمیت بالینی")).toBeInTheDocument();

      // Verify table cell contents with English and numbers
      expect(screen.getByText("فشار متوسط شریانی")).toBeInTheDocument();
      expect(screen.getByText(/MAP = DP \+ 1\/3 PP/)).toBeInTheDocument();
      expect(screen.getByText(/۷۰ تا ۱۰۵ mmHg/)).toBeInTheDocument();
      expect(screen.getByText(/شاخص پرفیوژن ارگان‌های حیاتی/)).toBeInTheDocument();

      // Verify scroll container styling
      const tableElement = screen.getByRole("table");
      const scrollContainer = tableElement.closest(".table-scroll-container");
      expect(scrollContainer).toBeInTheDocument();
      expect(scrollContainer?.classList.contains("overflow-x-auto")).toBe(true);
      expect(scrollContainer?.classList.contains("overscroll-x-contain")).toBe(true);
      expect(scrollContainer?.classList.contains("border")).toBe(true);

      // Verify table element borders and compact font size
      expect(tableElement.classList.contains("border")).toBe(true);
      expect(tableElement.classList.contains("border-collapse")).toBe(true);
      expect(tableElement.className).toContain("text-xs sm:text-[13px]");

      // Verify all th and td have explicit borders and appropriate font sizing
      const ths = tableElement.querySelectorAll("th");
      expect(ths.length).toBeGreaterThan(0);
      ths.forEach((th) => {
        expect(th.className).toContain("border");
        expect(th.className).toContain("border-[var(--color-border,#E2E7EA)]");
        expect(th.className).toContain("text-[11px] sm:text-xs");
      });

      const tds = tableElement.querySelectorAll("td");
      expect(tds.length).toBeGreaterThan(0);
      tds.forEach((td) => {
        expect(td.className).toContain("border");
        expect(td.className).toContain("border-[var(--color-border,#E2E7EA)]");
        expect(td.className).toContain("text-xs sm:text-[13px]");
      });

      // Verify regular text outside table retains standard size (text-xs sm:text-sm)
      const regularTextItem = screen.getByText("پارامترهای حیاتی قلبی و تعاریف ریاضی آنها:").closest("li");
      expect(regularTextItem?.className).toContain("text-xs sm:text-sm");

      // Verify table row is rendered as a clean block without list bullets
      const tableLi = scrollContainer?.closest("li");
      expect(tableLi?.classList.contains("list-none")).toBe(true);

      // Verify exam point remains consolidated at bottom
      expect(screen.getByText("نکات طلایی امتحانی")).toBeInTheDocument();
      expect(screen.getByText(/حداقل MAP برای حفظ پرفیوژن کلیوی ۶۵ میلی‌متر جیوه است/)).toBeInTheDocument();
    });

    it("verifies balanced section divider spacing between topic sections", async () => {
      const multiSectionPayload: ReviewSummaryPayload = {
        kind: "review_summary",
        title: "فارماکولوژی چندبخشی",
        estimatedReadingMinutes: 8,
        overview: "نمای کلی دو بخش مجزا.",
        sections: [
          {
            title: "بخش اول: مهارکننده‌های ACE",
            keyPoints: ["کاپتوپریل داروی اول."],
          },
          {
            title: "بخش دوم: مسدودکننده‌های گیرنده ARB",
            keyPoints: ["لوزارتان داروی دوم."],
          },
        ],
        finalTakeaways: ["جمع‌بندی پایانی."],
        citationChunkIds: ["chunk-1"],
      };

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (String(url).includes("/review-summary")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-multi-spacing",
              content: {
                id: "content-multi-spacing",
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

      const { container } = render(
        <QueryClientProvider client={createTestQueryClient()}>
          <ReviewSummaryViewer
            organizationId={mockOrgId}
            documentId={mockDocId}
            courseId={mockCourseId}
          />
        </QueryClientProvider>,
      );

      expect(await screen.findByText("بخش اول: مهارکننده‌های ACE")).toBeInTheDocument();
      expect(screen.getByText("بخش دوم: مسدودکننده‌های گیرنده ARB")).toBeInTheDocument();

      // Verify container has subtle neutral divider class
      const sectionsContainer = container.querySelector(".divide-y");
      expect(sectionsContainer).toBeInTheDocument();
      expect(sectionsContainer?.className).toContain("divide-[var(--color-border,#E2E7EA)]");

      const sections = container.querySelectorAll("section");
      expect(sections.length).toBeGreaterThanOrEqual(2);

      // Section 1: Top spacing 0, bottom padding before divider line
      expect(sections[0].className).toContain("pt-0");
      expect(sections[0].className).toMatch(/pb-\d+/);

      // Section 2: Top padding after divider line
      expect(sections[1].className).toMatch(/pt-\d+/);
      expect(sections[1].className).toContain("pb-2");
    });
  });
});
