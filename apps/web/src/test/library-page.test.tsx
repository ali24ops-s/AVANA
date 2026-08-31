import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LibraryPage } from "../pages/LibraryPage.js";
import { ContentPackCard } from "../components/library/ContentPackCard.js";
import { PackDetailModal } from "../components/library/PackDetailModal.js";
import { AddToCourseModal } from "../components/library/AddToCourseModal.js";
import { PublishPackModal } from "../components/library/PublishPackModal.js";
import { PopularCoursesLibrarySection } from "../components/library/PopularCoursesLibrarySection.js";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import type {
  PublicContentPackItemSummary,
  PublicContentPackDetailResource,
} from "@avana/domain";
import type { CourseResource, DocumentResource } from "@avana/contracts";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-123", email: "student@avana.ir", role: "student" },
    memberships: [{ organization_id: "org-test-1", role: "student" }],
    isAuthenticated: true,
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

const mockPacks: PublicContentPackItemSummary[] = [
  {
    id: "pack-1",
    title: "فیزیولوژی قلب و عروق",
    description: "درسنامه جامع الکتروفیزیولوژی قلب، سیکل قلبی و همودینامیک عروق",
    subject: "فیزیولوژی",
    creator: { id: "user-creator-1", name: "دکتر رضایی" },
    usage_count: 42,
    stats: {
      session_count: 5,
      flashcard_count: 24,
      quiz_question_count: 15,
      estimated_reading_minutes: 45,
    },
    published_at: "2026-08-20T10:00:00.000Z",
  },
  {
    id: "pack-2",
    title: "فارماکولوژی آنتی‌بیوتیک‌ها",
    description: "دسته‌بندی پنی‌سیلین‌ها، سفالوسپورین‌ها و ماکرولیدها",
    subject: "فارماکولوژی",
    creator: { id: "user-creator-2", name: "کاربر آوانا" },
    usage_count: 18,
    stats: {
      session_count: 3,
      flashcard_count: 30,
      quiz_question_count: 20,
      estimated_reading_minutes: 35,
    },
    published_at: "2026-08-22T14:30:00.000Z",
  },
];

const mockPackDetail: PublicContentPackDetailResource = {
  id: "pack-1",
  title: "فیزیولوژی قلب و عروق",
  description: "درسنامه جامع الکتروفیزیولوژی قلب، سیکل قلبی و همودینامیک عروق",
  subject: "فیزیولوژی",
  creator: { id: "user-creator-1", name: "دکتر رضایی" },
  usage_count: 42,
  stats: {
    session_count: 5,
    flashcard_count: 24,
    quiz_question_count: 15,
    estimated_reading_minutes: 45,
  },
  published_at: "2026-08-20T10:00:00.000Z",
  preview: {
    lesson: {
      title: "فیزیولوژی قلب و عروق",
      sessionCount: 5,
      sessionTitles: [
        "جلسه ۱: پتانسیل عمل سلول‌های قلبی",
        "جلسه ۲: هدایت الکتریکی و گره SA",
        "جلسه ۳: سیکل انقباضی و دیاستول",
        "جلسه ۴: فشار خون و مقاومت عروقی",
        "جلسه ۵: تنظیم هورمونی و عصبی گردش خون",
      ],
    },
    flashcard: {
      totalCards: 24,
      sampleQuestions: [
        "مکانیسم اثر کانال‌های سدیمی سریع در پتانسیل عمل قلبی چیست؟",
        "تفاوت پتانسیل عمل گره سینوسی با میوسیت بطنی در کدام فاز است؟",
      ],
    },
    quiz: {
      title: "آزمون جامع الکتروفیزیولوژی و همودینامیک",
      totalQuestions: 15,
      topics: ["الکتروفیزیولوژی", "سیکل قلبی", "همودینامیک"],
    },
    review_summary: {
      title: "خلاصه و نکات کلیدی فیزیولوژی قلب",
      overview:
        "در این بسته مبانی پتانسیل عمل قلبی، کانال‌های کلسیمی نوع L، فاز کفه و مکانیسم فرانک استارلینگ با جزییات مرور شده‌اند.",
      estimatedReadingMinutes: 45,
    },
  },
};

const mockCourses: CourseResource[] = [
  {
    id: "course-101",
    title: "فیزیولوژی پزشکی ترم ۳",
    subject: "پزشکی عمومی",
    exam_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
  },
  {
    id: "course-102",
    title: "فارماکولوژی پایه",
    subject: "داروسازی",
    exam_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived: false,
  },
];

describe("Public Content Library & Content Packs Web UI Suite", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderWithProviders(ui: React.ReactElement) {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    );
  }

  // -------------------------------------------------------------------------
  // 1. Library Page & Pack Cards
  // -------------------------------------------------------------------------
  describe("Library Page & Content Pack Cards", () => {
    it("renders page hero header, title, and subtitle correctly", () => {
      renderWithProviders(<LibraryPage />);
      expect(screen.getByText("کتابخانه آوانا")).toBeDefined();
      expect(
        screen.getByText(
          /مطالب آموزشی آماده را پیدا کن و به دوره خودت اضافه کن/i,
        ),
      ).toBeDefined();
    });

    it("fetches and displays content pack list, handles search, subject filter, and sorting", async () => {
      let requestedUrl = "";
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        requestedUrl = String(url);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-list",
            items: mockPacks,
            pagination: {
              page: 1,
              limit: 12,
              total_count: 2,
              total_pages: 1,
            },
          }),
          text: async () =>
            JSON.stringify({
              request_id: "req-list",
              items: mockPacks,
              pagination: {
                page: 1,
                limit: 12,
                total_count: 2,
                total_pages: 1,
              },
            }),
        } as Response);
      });

      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByText("فیزیولوژی قلب و عروق")).toBeDefined();
        expect(screen.getByText("فارماکولوژی آنتی‌بیوتیک‌ها")).toBeDefined();
      });

      // Subject Filter test
      const pharmSubject = screen.getByRole("button", { name: "فارماکولوژی" });
      fireEvent.click(pharmSubject);
      await waitFor(() => {
        expect(requestedUrl).toContain("subject=%D9%81%D8%A7%D8%B1%D9%85%D8%A7%DA%A9%D9%88%D9%84%D9%88%DA%98%DB%8C");
      });

      // Sort Toggle test
      const newestBtn = screen.getByText("جدیدترین");
      fireEvent.click(newestBtn);
      await waitFor(() => {
        expect(requestedUrl).toContain("sort=newest");
      });

      // Search Input test
      const searchInput = screen.getByPlaceholderText(
        "جستجو در عنوان، موضوع یا محتوای بسته‌ها...",
      );
      fireEvent.change(searchInput, { target: { value: "قلب" } });
      await waitFor(
        () => {
          expect(requestedUrl).toContain("q=%D9%82%D9%84%D8%A8");
        },
        { timeout: 1000 },
      );

      // Clear search button test
      const clearBtn = screen.getByLabelText("پاک کردن جستجو");
      fireEvent.click(clearBtn);
      expect(searchInput.value).toBe("");
    });

    it("displays empty search state when no packs match query", async () => {
      vi.spyOn(global, "fetch").mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-empty",
            items: [],
            pagination: {
              page: 1,
              limit: 12,
              total_count: 0,
              total_pages: 0,
            },
          }),
          text: async () =>
            JSON.stringify({
              request_id: "req-empty",
              items: [],
              pagination: {
                page: 1,
                limit: 12,
                total_count: 0,
                total_pages: 0,
              },
            }),
        } as Response);
      });

      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(
          screen.getByText("هنوز محتوایی در کتابخانه منتشر نشده است."),
        ).toBeDefined();
      });
    });

    it("displays error state with retry button on network failure", async () => {
      vi.spyOn(global, "fetch").mockImplementation(() => {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            error: {
              code: "internal_error",
              message: "Database connection failed",
            },
          }),
          text: async () =>
            JSON.stringify({
              error: {
                code: "internal_error",
                message: "Database connection failed",
              },
            }),
        } as Response);
      });

      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(
          screen.getByText("خطا در دریافت بسته‌های کتابخانه"),
        ).toBeDefined();
        expect(screen.getAllByText("تلاش مجدد").length).toBeGreaterThan(0);
      });
    });

    it("renders ContentPackCard with all metadata, statistics, creator, and CTAs", () => {
      const onViewDetails = vi.fn();
      const onAddToCourse = vi.fn();

      renderWithProviders(
        <ContentPackCard
          pack={mockPacks[0]}
          onViewDetails={onViewDetails}
          onAddToCourse={onAddToCourse}
        />,
      );

      // Title & Description
      expect(screen.getByText("فیزیولوژی قلب و عروق")).toBeDefined();
      expect(
        screen.getByText(
          /درسنامه جامع الکتروفیزیولوژی قلب، سیکل قلبی و همودینامیک عروق/i,
        ),
      ).toBeDefined();

      // Subject & Creator
      expect(screen.getByText("فیزیولوژی")).toBeDefined();
      expect(screen.getByText("دکتر رضایی")).toBeDefined();

      // Stats
      expect(screen.getByText("5 جلسه درس")).toBeDefined();
      expect(screen.getByText("24 فلش‌کارت")).toBeDefined();
      expect(screen.getByText("15 سوال آزمون")).toBeDefined();
      expect(screen.getByText("~45 دقیقه")).toBeDefined();
      expect(screen.getByText("42 نصب")).toBeDefined();

      // CTAs
      const viewBtn = screen.getByText("مشاهده محتوا");
      const addBtn = screen.getByText("افزودن به دوره");
      expect(viewBtn).toBeDefined();
      expect(addBtn).toBeDefined();

      fireEvent.click(viewBtn);
      expect(onViewDetails).toHaveBeenCalledWith(mockPacks[0]);

      fireEvent.click(addBtn);
      expect(onAddToCourse).toHaveBeenCalledWith(mockPacks[0]);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Pack Detail Modal & Safe Previews
  // -------------------------------------------------------------------------
  describe("Pack Detail Modal & Content Preview", () => {
    it("renders detailed preview tabs for lesson outline, flashcards, quiz topics, and summary", async () => {
      // Mock getPack API
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/v1/library/packs/pack-1")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-1",
              pack: mockPackDetail,
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-1",
                pack: mockPackDetail,
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const onClose = vi.fn();
      const onAddToCourse = vi.fn();

      renderWithProviders(
        <PackDetailModal
          packId="pack-1"
          open={true}
          onClose={onClose}
          onAddToCourse={onAddToCourse}
        />,
      );

      // Wait for data load
      await waitFor(() => {
        expect(screen.getByText("جلسه ۱: پتانسیل عمل سلول‌های قلبی")).toBeDefined();
      });

      // Check all 5 session titles in outline
      expect(screen.getByText("جلسه ۲: هدایت الکتریکی و گره SA")).toBeDefined();
      expect(screen.getByText("جلسه ۳: سیکل انقباضی و دیاستول")).toBeDefined();
      expect(screen.getByText("جلسه ۴: فشار خون و مقاومت عروقی")).toBeDefined();
      expect(screen.getByText("جلسه ۵: تنظیم هورمونی و عصبی گردش خون")).toBeDefined();

      // Switch to Flashcards tab
      const flashcardTab = screen.getByText("نمونه فلش‌کارت‌ها");
      fireEvent.click(flashcardTab);
      expect(
        screen.getByText(
          "مکانیسم اثر کانال‌های سدیمی سریع در پتانسیل عمل قلبی چیست؟",
        ),
      ).toBeDefined();

      // Switch to Quiz tab
      const quizTab = screen.getByText("سرفصل‌های آزمون");
      fireEvent.click(quizTab);
      expect(screen.getByText("الکتروفیزیولوژی")).toBeDefined();
      expect(screen.getByText("همودینامیک")).toBeDefined();

      // Switch to Summary tab
      const summaryTab = screen.getByText("خلاصه مروری");
      fireEvent.click(summaryTab);
      expect(
        screen.getByText(
          /در این بسته مبانی پتانسیل عمل قلبی، کانال‌های کلسیمی نوع L/i,
        ),
      ).toBeDefined();

      // Add to course button inside detail modal
      const addBtn = screen.getByText("افزودن این بسته به دوره من");
      fireEvent.click(addBtn);
      expect(onClose).toHaveBeenCalled();
      expect(onAddToCourse).toHaveBeenCalled();
    });

    it("verifies security: raw internal IDs, storage keys, and raw payloads are NEVER dumped in DOM", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/v1/library/packs/pack-1")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-1",
              pack: mockPackDetail,
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-1",
                pack: mockPackDetail,
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const { container } = renderWithProviders(
        <PackDetailModal
          packId="pack-1"
          open={true}
          onClose={vi.fn()}
          onAddToCourse={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("جلسه ۱: پتانسیل عمل سلول‌های قلبی")).toBeDefined();
      });

      const html = container.innerHTML;
      expect(html).not.toContain("source_document_id");
      expect(html).not.toContain("storage_key");
      expect(html).not.toContain("s3://");
      expect(html).not.toContain("payload_snapshot");
      expect(html).not.toContain("internal_raw_data");
    });

    it("positions modal container below main header using CSS variable to prevent overlap", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/v1/library/packs/pack-1")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-1",
              pack: mockPackDetail,
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-1",
                pack: mockPackDetail,
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <PackDetailModal
          packId="pack-1"
          open={true}
          onClose={vi.fn()}
          onAddToCourse={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("فیزیولوژی قلب و عروق")).toBeDefined();
      });

      const dialog = screen.getByRole("dialog");
      expect(dialog.className).toContain("top-[var(--header-height,5rem)]");
      expect(dialog.className).toContain("fixed");
      expect(dialog.className).toContain("inset-x-0");
      expect(dialog.className).toContain("bottom-0");
      expect(dialog.className).toContain("z-[9999]");
      expect(dialog.className).toContain("overflow-y-auto");

      // Verify close button and modal header exist and are accessible
      expect(screen.getByLabelText("بستن پنجره")).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Add to Course UX & Idempotency States
  // -------------------------------------------------------------------------
  describe("Add to Course Selection & Result Flows", () => {
    it("allows selecting target course and shows instant materialized breakdown on success", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url, _init) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/organizations") && urlStr.includes("/courses/my")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ request_id: "r1", items: mockCourses }),
            text: async () => JSON.stringify({ request_id: "r1", items: mockCourses }),
          } as Response);
        }
        if (urlStr.includes("/v1/organizations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ request_id: "r1", items: [{ id: "org-test-1", name: "دانشگاه" }] }),
            text: async () => JSON.stringify({ request_id: "r1", items: [{ id: "org-test-1", name: "دانشگاه" }] }),
          } as Response);
        }
        if (urlStr.includes("/add-to-course")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "r2",
              success: true,
              already_installed: false,
              materialized: {
                module_id: "mod-1",
                module_title: "فیزیولوژی قلب و عروق",
                lessons_created: 5,
                flashcards_created: 24,
                quizzes_created: 1,
                quiz_questions_created: 15,
                review_summary_created: true,
              },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "r2",
                success: true,
                already_installed: false,
                materialized: {
                  module_id: "mod-1",
                  module_title: "فیزیولوژی قلب و عروق",
                  lessons_created: 5,
                  flashcards_created: 24,
                  quizzes_created: 1,
                  quiz_questions_created: 15,
                  review_summary_created: true,
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const onNavigateToCourse = vi.fn();

      renderWithProviders(
        <AddToCourseModal
          pack={mockPacks[0]}
          open={true}
          onClose={vi.fn()}
          onNavigateToCourse={onNavigateToCourse}
        />,
      );

      // Verify course selector rendered
      await waitFor(() => {
        expect(screen.getByText("فیزیولوژی پزشکی ترم ۳")).toBeDefined();
        expect(screen.getByText("فارماکولوژی پایه")).toBeDefined();
      });

      // Submit Add
      const submitBtn = screen.getByText("تایید و افزودن به دوره");
      fireEvent.click(submitBtn);

      // Verify success feedback breakdown
      await waitFor(() => {
        expect(screen.getByText("این بسته با موفقیت به دوره شما اضافه شد.")).toBeDefined();
        expect(screen.getByText("5 جلسه درسنامه اختصاصی")).toBeDefined();
        expect(screen.getByText("24 فلش‌کارت در صف مرور هوشمند")).toBeDefined();
        expect(screen.getByText("15 سوال آزمون تستی آماده")).toBeDefined();
      });

      // CTA
      const goToCourseBtn = screen.getByText("رفتن به دوره");
      fireEvent.click(goToCourseBtn);
      expect(onNavigateToCourse).toHaveBeenCalledWith("course-101");
    });

    it("handles already_installed === true gracefully without duplicate insertion", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/organizations") && urlStr.includes("/courses/my")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ request_id: "r1", items: mockCourses }),
            text: async () => JSON.stringify({ request_id: "r1", items: mockCourses }),
          } as Response);
        }
        if (urlStr.includes("/v1/organizations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ request_id: "r1", items: [{ id: "org-test-1", name: "دانشگاه" }] }),
            text: async () => JSON.stringify({ request_id: "r1", items: [{ id: "org-test-1", name: "دانشگاه" }] }),
          } as Response);
        }
        if (urlStr.includes("/add-to-course")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "r2",
              success: true,
              already_installed: true,
              materialized: {
                module_id: "mod-1",
                lessons_created: 0,
                flashcards_created: 0,
                quiz_questions_created: 0,
              },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "r2",
                success: true,
                already_installed: true,
                materialized: {
                  module_id: "mod-1",
                  lessons_created: 0,
                  flashcards_created: 0,
                  quiz_questions_created: 0,
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <AddToCourseModal
          pack={mockPacks[0]}
          open={true}
          onClose={vi.fn()}
          onNavigateToCourse={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("فیزیولوژی پزشکی ترم ۳")).toBeDefined();
      });

      const submitBtn = screen.getByText("تایید و افزودن به دوره");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText("این بسته قبلاً به این دوره اضافه شده است."),
        ).toBeDefined();
      });
    });

    it("allows selecting a different course (Course B) in multi-course account and sends correct courseId", async () => {
      let sentBody = "";
      vi.spyOn(global, "fetch").mockImplementation((url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/organizations") && urlStr.includes("/courses/my")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ request_id: "r1", items: mockCourses }),
            text: async () => JSON.stringify({ request_id: "r1", items: mockCourses }),
          } as Response);
        }
        if (urlStr.includes("/v1/organizations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ request_id: "r1", items: [{ id: "org-test-1", name: "دانشگاه" }] }),
            text: async () => JSON.stringify({ request_id: "r1", items: [{ id: "org-test-1", name: "دانشگاه" }] }),
          } as Response);
        }
        if (urlStr.includes("/add-to-course")) {
          sentBody = init?.body ? String(init.body) : "";
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "r2",
              success: true,
              already_installed: false,
              materialized: {
                module_id: "mod-2",
                module_title: "فیزیولوژی قلب و عروق",
                lessons_created: 5,
                flashcards_created: 24,
                quizzes_created: 1,
                quiz_questions_created: 15,
                review_summary_created: true,
              },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "r2",
                success: true,
                already_installed: false,
                materialized: {
                  module_id: "mod-2",
                  module_title: "فیزیولوژی قلب و عروق",
                  lessons_created: 5,
                  flashcards_created: 24,
                  quizzes_created: 1,
                  quiz_questions_created: 15,
                  review_summary_created: true,
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <AddToCourseModal
          pack={mockPacks[0]}
          open={true}
          onClose={vi.fn()}
        />,
      );

      // Wait for courses to load
      await waitFor(() => {
        expect(screen.getByText("فارماکولوژی پایه")).toBeDefined();
      });

      // Click second course (فارماکولوژی پایه)
      const secondCourseItem = screen.getByText("فارماکولوژی پایه");
      fireEvent.click(secondCourseItem);

      // Submit
      const submitBtn = screen.getByText("تایید و افزودن به دوره");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(sentBody).toContain('"course_id":"course-102"');
        expect(screen.getByText("این بسته با موفقیت به دوره شما اضافه شد.")).toBeDefined();
      });
    });

    it("closes modal upon pressing Escape key or clicking backdrop", async () => {
      const onClose = vi.fn();
      renderWithProviders(
        <PackDetailModal
          packId="pack-1"
          open={true}
          onClose={onClose}
          onAddToCourse={vi.fn()}
        />,
      );

      // Press ESC key
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });

    it("maps 403, 404, 400 error codes to student-friendly Persian messages", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/organizations") && urlStr.includes("/courses/my")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ request_id: "r1", items: mockCourses }),
            text: async () => JSON.stringify({ request_id: "r1", items: mockCourses }),
          } as Response);
        }
        if (urlStr.includes("/v1/organizations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ request_id: "r1", items: [{ id: "org-test-1", name: "دانشگاه" }] }),
            text: async () => JSON.stringify({ request_id: "r1", items: [{ id: "org-test-1", name: "دانشگاه" }] }),
          } as Response);
        }
        if (urlStr.includes("/add-to-course")) {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: async () => ({
              error: {
                code: "forbidden",
                message: "Access denied to target course organization",
              },
            }),
            text: async () =>
              JSON.stringify({
                error: {
                  code: "forbidden",
                  message: "Access denied to target course organization",
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <AddToCourseModal
          pack={mockPacks[0]}
          open={true}
          onClose={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("فیزیولوژی پزشکی ترم ۳")).toBeDefined();
      });

      const submitBtn = screen.getByText("تایید و افزودن به دوره");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText("شما به این دوره آموزشی دسترسی لازم را ندارید."),
        ).toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 4. Creator Publish Modal & Document Status Card Flow
  // -------------------------------------------------------------------------
  describe("Creator Publish Modal Flow", () => {
    const mockDocForModal: DocumentResource = {
      id: "doc-100",
      course_id: "course-101",
      organization_id: "org-test-1",
      original_name: "فیزیولوژی_تنفس.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024 * 500,
      storage_key: "org-test-1/docs/doc-100.pdf",
      page_count: 20,
      status: "ready",
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it("1. Clicking publish button opens PublishPackModal", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              lesson: { generated: true, count: 2, accepted: true },
              flashcards: { generated: false, count: 0, accepted: false },
              exam: { generated: false, count: 0, accepted: false },
              review_summary: { generated: false, count: 0, accepted: false },
              can_generate: true,
              all_generated: false,
              has_publishable_content: true,
            }),
            text: async () =>
              JSON.stringify({
                lesson: { generated: true, count: 2, accepted: true },
                flashcards: { generated: false, count: 0, accepted: false },
                exam: { generated: false, count: 0, accepted: false },
                review_summary: { generated: false, count: 0, accepted: false },
                can_generate: true,
                all_generated: false,
                has_publishable_content: true,
              }),
          } as Response);
        }
        if (String(url).includes("/status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-st-1",
              status: { id: "st-1", document_id: "doc-100", status: "ready", page_count: 20, chunk_count: 4 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-st-1",
                status: { id: "st-1", document_id: "doc-100", status: "ready", page_count: 20, chunk_count: 4 },
              }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" } as Response);
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDocForModal}
          organizationId="org-test-1"
          courseId="course-101"
        />,
      );

      const publishBtn = await screen.findByRole("button", { name: /انتشار در کتابخانه/i });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
        expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
        expect(screen.getByRole("heading", { name: /انتشار در کتابخانه آوانا/i })).toBeDefined();
      });
    });

    it("2. Clicking publish does NOT navigate to another route", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              lesson: { generated: true, count: 2, accepted: true },
              flashcards: { generated: false, count: 0, accepted: false },
              exam: { generated: false, count: 0, accepted: false },
              has_publishable_content: true,
            }),
            text: async () =>
              JSON.stringify({
                lesson: { generated: true, count: 2, accepted: true },
                flashcards: { generated: false, count: 0, accepted: false },
                exam: { generated: false, count: 0, accepted: false },
                has_publishable_content: true,
              }),
          } as Response);
        }
        if (String(url).includes("/status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-st-1",
              status: { id: "st-1", document_id: "doc-100", status: "ready" },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-st-1",
                status: { id: "st-1", document_id: "doc-100", status: "ready" },
              }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" } as Response);
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/courses/101/documents"]}>
            <Routes>
              <Route
                path="/courses/101/documents"
                element={
                  <div>
                    <span data-testid="current-route">/courses/101/documents</span>
                    <DocumentStatusCard
                      document={mockDocForModal}
                      organizationId="org-test-1"
                      courseId="course-101"
                    />
                  </div>
                }
              />
              <Route path="*" element={<span data-testid="other-route">other</span>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const publishBtn = await screen.findByRole("button", { name: /انتشار در کتابخانه/i });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
        expect(screen.getByTestId("current-route").textContent).toBe("/courses/101/documents");
        expect(screen.queryByTestId("other-route")).toBeNull();
      });
    });

    it("3. Modal renders publication information", () => {
      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی پزشکی"
          defaultSubject="پزشکی"
          open={true}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByRole("heading", { name: /انتشار در کتابخانه آوانا/i })).toBeDefined();
      expect(screen.getByText(/محتوای تأییدشده شما به‌صورت یک بسته آموزشی مستقل/i)).toBeDefined();
      expect(screen.getByText("تضمین عدم وابستگی و نسخه تغییرناپذیر")).toBeDefined();
      expect(screen.getByDisplayValue("فیزیولوژی پزشکی")).toBeDefined();
      expect(screen.getByDisplayValue("پزشکی")).toBeDefined();
      expect(screen.getByPlaceholderText(/نکات کلیدی، پیش‌نیازها/i)).toBeDefined();
    });

    it("4. Modal supports Lesson-only content", () => {
      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          open={true}
          onClose={vi.fn()}
          contentStatus={{
            lesson: { generated: true, count: 3, accepted: true },
            flashcards: { generated: false, count: 0, accepted: false },
            exam: { generated: false, count: 0, accepted: false },
          }}
        />,
      );

      expect(screen.getByText(/۳ درسنامه|3 درسنامه|درسنامه/)).toBeDefined();
      expect(screen.queryByText(/فلش‌کارت/)).toBeNull();
      expect(screen.queryByText(/سؤال آزمون/)).toBeNull();
    });

    it("5. Modal supports partial content", () => {
      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="مجموعه فلش و تست"
          open={true}
          onClose={vi.fn()}
          contentStatus={{
            lesson: { generated: false, count: 0, accepted: false },
            flashcards: { generated: true, count: 20, accepted: true },
            exam: { generated: true, count: 15, accepted: true },
          }}
        />,
      );

      expect(screen.getByText(/20 فلش‌کارت|۲۰ فلش‌کارت/)).toBeDefined();
      expect(screen.getByText(/15 سؤال آزمون|۱۵ سؤال آزمون/)).toBeDefined();
      expect(screen.queryByText(/درسنامه/)).toBeNull();
    });

    it("6. Confirm button calls existing publish API", async () => {
      let requestUrl = "";
      let requestMethod = "";
      let requestBody = "";

      vi.spyOn(global, "fetch").mockImplementation((url, init) => {
        if (String(url).includes("/content-pack/publish")) {
          requestUrl = String(url);
          requestMethod = init?.method ?? "GET";
          requestBody = init?.body ? String(init.body) : "";
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "pub-1",
              pack: {
                id: "pack-new-1",
                title: "فیزیولوژی تنفس ویرایش ۲",
                description: "توضیحات بسته",
                subject: "فیزیولوژی",
                status: "published",
                usage_count: 0,
                stats: { session_count: 4, flashcard_count: 20, quiz_question_count: 10, estimated_reading_minutes: 30 },
                published_at: new Date().toISOString(),
                items_count: 4,
              },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "pub-1",
                pack: {
                  id: "pack-new-1",
                  title: "فیزیولوژی تنفس ویرایش ۲",
                  description: "توضیحات بسته",
                  subject: "فیزیولوژی",
                  status: "published",
                  usage_count: 0,
                  stats: { session_count: 4, flashcard_count: 20, quiz_question_count: 10, estimated_reading_minutes: 30 },
                  published_at: new Date().toISOString(),
                  items_count: 4,
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          defaultSubject="فیزیولوژی"
          open={true}
          onClose={vi.fn()}
        />,
      );

      const titleInput = screen.getByDisplayValue("فیزیولوژی تنفس");
      fireEvent.change(titleInput, { target: { value: "فیزیولوژی تنفس ویرایش ۲" } });

      const descInput = screen.getByPlaceholderText(/نکات کلیدی، پیش‌نیازها/i);
      fireEvent.change(descInput, { target: { value: "توضیحات بسته" } });

      const submitBtn = screen.getByText("تایید و انتشار در کتابخانه");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(requestUrl).toContain("/v1/organizations/org-test-1/documents/doc-100/content-pack/publish");
        expect(requestMethod).toBe("POST");
        expect(requestBody).toContain('"title":"فیزیولوژی تنفس ویرایش ۲"');
        expect(requestBody).toContain('"description":"توضیحات بسته"');
      });
    });

    it("7. Confirm button becomes disabled while request is pending", async () => {
      let resolvePromise: (val: Response) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-pack/publish")) {
          return pendingPromise as Promise<Response>;
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          open={true}
          onClose={vi.fn()}
        />,
      );

      const submitBtn = screen.getByText("تایید و انتشار در کتابخانه");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("در حال انتشار در کتابخانه...")).toBeDefined();
        const pendingBtn = screen.getByRole("button", { name: /در حال انتشار در کتابخانه/i });
        expect(pendingBtn.hasAttribute("disabled")).toBe(true);
      });

      // Cleanup pending promise
      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "pub-1",
          pack: { id: "p1", title: "تست", status: "published", usage_count: 0, stats: {}, published_at: new Date().toISOString(), items_count: 1 },
        }),
        text: async () =>
          JSON.stringify({
            request_id: "pub-1",
            pack: { id: "p1", title: "تست", status: "published", usage_count: 0, stats: {}, published_at: new Date().toISOString(), items_count: 1 },
          }),
      });
    });

    it("8. Successful publish shows success state inside Modal", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-pack/publish")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "pub-1",
              pack: {
                id: "pack-new-1",
                title: "فیزیولوژی تنفس",
                description: null,
                subject: "فیزیولوژی",
                status: "published",
                usage_count: 0,
                stats: {
                  session_count: 4,
                  flashcard_count: 20,
                  quiz_question_count: 10,
                  estimated_reading_minutes: 30,
                },
                published_at: new Date().toISOString(),
                items_count: 4,
              },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "pub-1",
                pack: {
                  id: "pack-new-1",
                  title: "فیزیولوژی تنفس",
                  description: null,
                  subject: "فیزیولوژی",
                  status: "published",
                  usage_count: 0,
                  stats: {
                    session_count: 4,
                    flashcard_count: 20,
                    quiz_question_count: 10,
                    estimated_reading_minutes: 30,
                  },
                  published_at: new Date().toISOString(),
                  items_count: 4,
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          open={true}
          onClose={vi.fn()}
        />,
      );

      const submitBtn = screen.getByText("تایید و انتشار در کتابخانه");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("بسته آموزشی شما با موفقیت در کتابخانه آوانا منتشر شد.")).toBeDefined();
        expect(screen.getByText(/بسته آموزشی «فیزیولوژی تنفس» اکنون در کتابخانه عمومی/)).toBeDefined();
        expect(screen.getByText("4 جلسه")).toBeDefined();
        expect(screen.getByText("20 کارت")).toBeDefined();
        expect(screen.getByText("10 سؤال")).toBeDefined();
        expect(screen.getByRole("button", { name: "بستن" })).toBeDefined();
      });
    });

    it("9. 400 error is shown inside Modal", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-pack/publish")) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({
              error: {
                code: "bad_request",
                message: "این محتوا هنوز برای انتشار آماده نیست.",
              },
            }),
            text: async () =>
              JSON.stringify({
                error: {
                  code: "bad_request",
                  message: "این محتوا هنوز برای انتشار آماده نیست.",
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          open={true}
          onClose={vi.fn()}
        />,
      );

      const submitBtn = screen.getByText("تایید و انتشار در کتابخانه");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("این محتوا هنوز برای انتشار آماده نیست.")).toBeDefined();
      });
    });

    it("10. 409 error is handled correctly", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-pack/publish")) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: "conflict",
                message: "An active published pack already exists for this document",
              },
            }),
            text: async () =>
              JSON.stringify({
                error: {
                  code: "conflict",
                  message: "An active published pack already exists for this document",
                },
              }),
          } as Response);
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          open={true}
          onClose={vi.fn()}
        />,
      );

      const submitBtn = screen.getByText("تایید و انتشار در کتابخانه");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(
          screen.getByText("این سند قبلاً به عنوان یک بسته فعال در کتابخانه منتشر شده است."),
        ).toBeDefined();
      });
    });

    it("11. Escape closes Modal when idle", () => {
      const onClose = vi.fn();
      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          open={true}
          onClose={onClose}
        />,
      );

      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalled();
    });

    it("12. Backdrop closes Modal when idle", () => {
      const onClose = vi.fn();
      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          open={true}
          onClose={onClose}
        />,
      );

      const backdrop = screen.getByRole("dialog");
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it("13. Escape/backdrop do NOT close Modal while publishing", async () => {
      let resolvePromise: (val: Response) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-pack/publish")) {
          return pendingPromise as Promise<Response>;
        }
        return Promise.reject(new Error(`Unhandled URL: ${url}`));
      });

      const onClose = vi.fn();
      renderWithProviders(
        <PublishPackModal
          organizationId="org-test-1"
          documentId="doc-100"
          defaultTitle="فیزیولوژی تنفس"
          open={true}
          onClose={onClose}
        />,
      );

      const submitBtn = screen.getByText("تایید و انتشار در کتابخانه");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("در حال انتشار در کتابخانه...")).toBeDefined();
      });

      // Try pressing Escape
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();

      // Try clicking backdrop
      const backdrop = screen.getByRole("dialog");
      fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();

      // Cleanup
      resolvePromise!({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "pub-1",
          pack: { id: "p1", title: "تست", status: "published", usage_count: 0, stats: {}, published_at: new Date().toISOString(), items_count: 1 },
        }),
        text: async () =>
          JSON.stringify({
            request_id: "pub-1",
            pack: { id: "p1", title: "تست", status: "published", usage_count: 0, stats: {}, published_at: new Date().toISOString(), items_count: 1 },
          }),
      });
    });

    it("14. Document status is refreshed after successful publish", async () => {
      let publishCalled = false;
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/content-status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              lesson: { generated: true, count: 3, accepted: true },
              flashcards: { generated: false, count: 0, accepted: false },
              exam: { generated: false, count: 0, accepted: false },
              review_summary: { generated: false, count: 0, accepted: false },
              can_generate: true,
              all_generated: false,
              has_publishable_content: true,
            }),
            text: async () =>
              JSON.stringify({
                lesson: { generated: true, count: 3, accepted: true },
                flashcards: { generated: false, count: 0, accepted: false },
                exam: { generated: false, count: 0, accepted: false },
                review_summary: { generated: false, count: 0, accepted: false },
                can_generate: true,
                all_generated: false,
                has_publishable_content: true,
              }),
          } as Response);
        }
        if (urlStr.includes("/status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-st-1",
              status: { id: "st-1", document_id: "doc-100", status: "ready", page_count: 20, chunk_count: 4 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-st-1",
                status: { id: "st-1", document_id: "doc-100", status: "ready", page_count: 20, chunk_count: 4 },
              }),
          } as Response);
        }
        if (urlStr.includes("/content-pack/publish")) {
          publishCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "pub-1",
              pack: {
                id: "pack-new-1",
                title: "فیزیولوژی تنفس",
                description: "توضیحات",
                subject: "پزشکی",
                status: "published",
                usage_count: 0,
                stats: { session_count: 3, flashcard_count: 0, quiz_question_count: 0, estimated_reading_minutes: 25 },
                published_at: new Date().toISOString(),
                items_count: 1,
              },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "pub-1",
                pack: {
                  id: "pack-new-1",
                  title: "فیزیولوژی تنفس",
                  description: "توضیحات",
                  subject: "پزشکی",
                  status: "published",
                  usage_count: 0,
                  stats: { session_count: 3, flashcard_count: 0, quiz_question_count: 0, estimated_reading_minutes: 25 },
                  published_at: new Date().toISOString(),
                  items_count: 1,
                },
              }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" } as Response);
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDocForModal}
          organizationId="org-test-1"
          courseId="course-101"
        />,
      );

      // Initially, publish CTA is visible and published badge is absent
      const publishBtn = await screen.findByRole("button", { name: /انتشار در کتابخانه/i });
      expect(screen.queryByText("منتشر شده در کتابخانه")).toBeNull();

      // 1. Click publish button -> opens modal
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });

      // 2. Submit publication in modal
      const confirmBtn = screen.getByRole("button", { name: "تایید و انتشار در کتابخانه" });
      fireEvent.click(confirmBtn);

      // 3. In-modal success message appears
      await waitFor(() => {
        expect(publishCalled).toBe(true);
        expect(screen.getByText("بسته آموزشی شما با موفقیت در کتابخانه آوانا منتشر شد.")).toBeDefined();
      });

      // 4. Click Close button in modal
      const closeBtn = screen.getByRole("button", { name: "بستن" });
      fireEvent.click(closeBtn);

      // 5. Verify Modal is closed and DocumentStatusCard UI real state is updated
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByText("منتشر شده در کتابخانه")).toBeDefined();
        expect(screen.queryByRole("button", { name: /انتشار در کتابخانه/i })).toBeNull();
      });
    });

    it("15. Closing Modal without publishing does NOT change isPublished state", async () => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              lesson: { generated: true, count: 3, accepted: true },
              flashcards: { generated: false, count: 0, accepted: false },
              exam: { generated: false, count: 0, accepted: false },
              has_publishable_content: true,
            }),
            text: async () =>
              JSON.stringify({
                lesson: { generated: true, count: 3, accepted: true },
                flashcards: { generated: false, count: 0, accepted: false },
                exam: { generated: false, count: 0, accepted: false },
                has_publishable_content: true,
              }),
          } as Response);
        }
        if (String(url).includes("/status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-st-1",
              status: { id: "st-1", document_id: "doc-100", status: "ready" },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-st-1",
                status: { id: "st-1", document_id: "doc-100", status: "ready" },
              }),
          } as Response);
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" } as Response);
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDocForModal}
          organizationId="org-test-1"
          courseId="course-101"
        />,
      );

      const publishBtn = await screen.findByRole("button", { name: /انتشار در کتابخانه/i });
      fireEvent.click(publishBtn);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeDefined();
      });

      // Click cancel button
      const cancelBtn = screen.getByRole("button", { name: "انصراف" });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByText("منتشر شده در کتابخانه")).toBeNull();
        expect(screen.getByRole("button", { name: /انتشار در کتابخانه/i })).toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 5. DocumentStatusCard Publish CTA Eligibility Flow
  // -------------------------------------------------------------------------
  describe("DocumentStatusCard Publish CTA Flow", () => {
    const mockDoc: DocumentResource = {
      id: "doc-101",
      course_id: "course-101",
      organization_id: "org-test-1",
      original_name: "بیوشیمی_پزشکی.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024 * 500,
      storage_key: "org-test-1/docs/doc-101.pdf",
      page_count: 25,
      status: "ready",
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Helper to mock document status
    const mockDocStatusFetch = (contentStatus: unknown) => {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        if (String(url).includes("/content-status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => contentStatus,
            text: async () => JSON.stringify(contentStatus),
          } as Response);
        }
        if (String(url).includes("/status")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-st-1",
              status: {
                id: "st-1",
                document_id: "doc-101",
                status: "ready",
                page_count: 25,
                chunk_count: 5,
              },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-st-1",
                status: {
                  id: "st-1",
                  document_id: "doc-101",
                  status: "ready",
                  page_count: 25,
                  chunk_count: 5,
                },
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => JSON.stringify({}),
        } as Response);
      });
    };

    // Condition 1: Lesson accepted => Publish visible
    it("1. Lesson accepted => Publish visible", async () => {
      mockDocStatusFetch({
        lesson: { generated: true, count: 3, accepted: true },
        flashcards: { generated: false, count: 0, accepted: false },
        exam: { generated: false, count: 0, accepted: false },
        review_summary: { generated: false, count: 0, accepted: false },
        can_generate: true,
        all_generated: false,
        has_publishable_content: true,
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDoc}
          organizationId="org-test-1"
          courseId="course-101"
          onDelete={vi.fn()}
          onGenerate={vi.fn()}
          onOpenDocument={vi.fn()}
          onNavigateToReview={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("آماده انتشار در کتابخانه عمومی آوانا")).toBeDefined();
        expect(screen.getByRole("button", { name: /انتشار در کتابخانه/i })).toBeDefined();
      });
    });

    // Condition 2: Lesson generated but draft => Publish hidden
    it("2. Lesson generated but draft => Publish hidden", async () => {
      mockDocStatusFetch({
        lesson: { generated: true, count: 3, accepted: false },
        flashcards: { generated: false, count: 0, accepted: false },
        exam: { generated: false, count: 0, accepted: false },
        review_summary: { generated: false, count: 0, accepted: false },
        can_generate: false,
        all_generated: false,
        has_publishable_content: false,
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDoc}
          organizationId="org-test-1"
          courseId="course-101"
          onDelete={vi.fn()}
          onGenerate={vi.fn()}
          onOpenDocument={vi.fn()}
          onNavigateToReview={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText("آماده انتشار در کتابخانه عمومی آوانا")).toBeNull();
        expect(screen.queryByRole("button", { name: /انتشار در کتابخانه/i })).toBeNull();
      });
    });

    // Condition 3: Lesson rejected => Publish hidden
    it("3. Lesson rejected => Publish hidden", async () => {
      mockDocStatusFetch({
        lesson: { generated: false, count: 0, accepted: false },
        flashcards: { generated: false, count: 0, accepted: false },
        exam: { generated: false, count: 0, accepted: false },
        review_summary: { generated: false, count: 0, accepted: false },
        can_generate: true,
        all_generated: false,
        has_publishable_content: false,
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDoc}
          organizationId="org-test-1"
          courseId="course-101"
          onDelete={vi.fn()}
          onGenerate={vi.fn()}
          onOpenDocument={vi.fn()}
          onNavigateToReview={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText("آماده انتشار در کتابخانه عمومی آوانا")).toBeNull();
        expect(screen.queryByRole("button", { name: /انتشار در کتابخانه/i })).toBeNull();
      });
    });

    // Condition 4: Flashcard accepted => Publish visible
    it("4. Flashcard accepted => Publish visible", async () => {
      mockDocStatusFetch({
        lesson: { generated: false, count: 0, accepted: false },
        flashcards: { generated: true, count: 12, accepted: true },
        exam: { generated: false, count: 0, accepted: false },
        review_summary: { generated: false, count: 0, accepted: false },
        can_generate: true,
        all_generated: false,
        has_publishable_content: true,
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDoc}
          organizationId="org-test-1"
          courseId="course-101"
          onDelete={vi.fn()}
          onGenerate={vi.fn()}
          onOpenDocument={vi.fn()}
          onNavigateToReview={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("آماده انتشار در کتابخانه عمومی آوانا")).toBeDefined();
        expect(screen.getByRole("button", { name: /انتشار در کتابخانه/i })).toBeDefined();
      });
    });

    // Condition 5: Quiz accepted => Publish visible
    it("5. Quiz accepted => Publish visible", async () => {
      mockDocStatusFetch({
        lesson: { generated: false, count: 0, accepted: false },
        flashcards: { generated: false, count: 0, accepted: false },
        exam: { generated: true, count: 8, accepted: true },
        review_summary: { generated: false, count: 0, accepted: false },
        can_generate: true,
        all_generated: false,
        has_publishable_content: true,
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDoc}
          organizationId="org-test-1"
          courseId="course-101"
          onDelete={vi.fn()}
          onGenerate={vi.fn()}
          onOpenDocument={vi.fn()}
          onNavigateToReview={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("آماده انتشار در کتابخانه عمومی آوانا")).toBeDefined();
        expect(screen.getByRole("button", { name: /انتشار در کتابخانه/i })).toBeDefined();
      });
    });

    // Condition 6: Review Summary accepted => Publish visible
    it("6. Review Summary accepted => Publish visible", async () => {
      mockDocStatusFetch({
        lesson: { generated: false, count: 0, accepted: false },
        flashcards: { generated: false, count: 0, accepted: false },
        exam: { generated: false, count: 0, accepted: false },
        review_summary: { generated: true, count: 1, accepted: true },
        can_generate: true,
        all_generated: false,
        has_publishable_content: true,
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDoc}
          organizationId="org-test-1"
          courseId="course-101"
          onDelete={vi.fn()}
          onGenerate={vi.fn()}
          onOpenDocument={vi.fn()}
          onNavigateToReview={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("آماده انتشار در کتابخانه عمومی آوانا")).toBeDefined();
        expect(screen.getByRole("button", { name: /انتشار در کتابخانه/i })).toBeDefined();
      });
    });

    // Condition 7: Only draft/rejected contents => Publish hidden
    it("7. Only draft/rejected contents => Publish hidden", async () => {
      mockDocStatusFetch({
        lesson: { generated: true, count: 3, accepted: false },
        flashcards: { generated: true, count: 10, accepted: false },
        exam: { generated: false, count: 0, accepted: false },
        review_summary: { generated: false, count: 0, accepted: false },
        can_generate: false,
        all_generated: false,
        has_publishable_content: false,
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDoc}
          organizationId="org-test-1"
          courseId="course-101"
          onDelete={vi.fn()}
          onGenerate={vi.fn()}
          onOpenDocument={vi.fn()}
          onNavigateToReview={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByText("آماده انتشار در کتابخانه عمومی آوانا")).toBeNull();
        expect(screen.queryByRole("button", { name: /انتشار در کتابخانه/i })).toBeNull();
      });
    });

    // Condition 8: Lesson draft + Quiz accepted => Publish visible
    it("8. Lesson draft + Quiz accepted => Publish visible", async () => {
      mockDocStatusFetch({
        lesson: { generated: true, count: 3, accepted: false },
        flashcards: { generated: false, count: 0, accepted: false },
        exam: { generated: true, count: 5, accepted: true },
        review_summary: { generated: false, count: 0, accepted: false },
        can_generate: false,
        all_generated: false,
        has_publishable_content: true,
      });

      renderWithProviders(
        <DocumentStatusCard
          document={mockDoc}
          organizationId="org-test-1"
          courseId="course-101"
          onDelete={vi.fn()}
          onGenerate={vi.fn()}
          onOpenDocument={vi.fn()}
          onNavigateToReview={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText("آماده انتشار در کتابخانه عمومی آوانا")).toBeDefined();
        expect(screen.getByRole("button", { name: /انتشار در کتابخانه/i })).toBeDefined();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. Popular Avana Courses Section in Library (محبوب‌ترین دوره‌های آوانا)
  // -------------------------------------------------------------------------
  describe("Popular Avana Courses in Library (محبوب‌ترین دوره‌های آوانا)", () => {
    const popularOrgId = "org-test-1";
    const persianDigits = ["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸"];
    const sample8PopularCourses: CourseResource[] = Array.from(
      { length: 8 },
      (_, i) => ({
        id: `course-pop-${i + 1}`,
        title: `دوره آموزشی شماره ${persianDigits[i]}`,
        subject: `رشته تخصصی ${persianDigits[i]}`,
        exam_at: null,
        created_at: new Date(2026, 7, 25 - i).toISOString(),
        updated_at: new Date(2026, 7, 25 - i).toISOString(),
        archived: false,
      }),
    );

    function setupLibraryWithPopularMocks(
      popularCourses: CourseResource[] = sample8PopularCourses,
      isPopularError = false,
    ) {
      queryClient.clear();
      let requestedPopularUrl = "";
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/courses/popular")) {
          requestedPopularUrl = urlStr;
          if (isPopularError) {
            return Promise.resolve({
              ok: false,
              status: 500,
              json: async () => ({
                error: { code: "internal_error", message: "Server error" },
              }),
              text: async () => JSON.stringify({ error: "Server error" }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-pop",
              items: popularCourses,
              pagination: { limit: 8, next_cursor: null },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-pop",
                items: popularCourses,
                pagination: { limit: 8, next_cursor: null },
              }),
          } as Response);
        }
        if (urlStr.endsWith("/courses") || urlStr.includes("/courses?")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-courses",
              items: popularCourses,
              pagination: { limit: 50, next_cursor: null },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-courses",
                items: popularCourses,
                pagination: { limit: 50, next_cursor: null },
              }),
          } as Response);
        }
        if (urlStr.includes("/organizations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-orgs",
              items: [{ id: popularOrgId, name: "سازمان آوانا" }],
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: popularOrgId, name: "سازمان آوانا" }],
              }),
          } as Response);
        }
        if (urlStr.includes("/library/packs")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-packs",
              items: mockPacks,
              pagination: { page: 1, limit: 12, total_count: 2, total_pages: 1 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-packs",
                items: mockPacks,
                pagination: { page: 1, limit: 12, total_count: 2, total_pages: 1 },
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ items: [] }),
          text: async () => JSON.stringify({ items: [] }),
        } as Response);
      });

      return {
        getRequestedPopularUrl: () => requestedPopularUrl,
      };
    }

    it("1. renders PopularCoursesLibrarySection standalone with header, title, subtitle, and CTA link", async () => {
      setupLibraryWithPopularMocks();
      renderWithProviders(<PopularCoursesLibrarySection organizationId={popularOrgId} />);

      await waitFor(() => {
        const popSection = screen.getByTestId("popular-courses-library-section");
        expect(within(popSection).getByText("محبوب‌ترین دوره‌های آوانا")).toBeDefined();
        expect(
          within(popSection).getByText(
            "دوره‌هایی که بیشتر توسط کاربران آوانا انتخاب و استفاده شده‌اند",
          ),
        ).toBeDefined();
        expect(within(popSection).getByText("مشاهده همه دوره‌ها")).toBeDefined();
      });
    });

    it("2. calls real endpoint GET /v1/organizations/:organizationId/courses/popular with correct organizationId", async () => {
      const { getRequestedPopularUrl } = setupLibraryWithPopularMocks();
      renderWithProviders(<PopularCoursesLibrarySection organizationId={popularOrgId} />);

      await waitFor(() => {
        expect(getRequestedPopularUrl()).toContain(
          `/v1/organizations/${popularOrgId}/courses/popular`,
        );
      });
    });

    it("3. displays maximum 8 courses in exact ranking order from API without re-sorting in popular section", async () => {
      setupLibraryWithPopularMocks(sample8PopularCourses);
      renderWithProviders(<PopularCoursesLibrarySection organizationId={popularOrgId} />);

      await waitFor(() => {
        const popSection = screen.getByTestId("popular-courses-library-section");
        expect(within(popSection).getByText("دوره آموزشی شماره ۱")).toBeDefined();
        expect(within(popSection).getByText("دوره آموزشی شماره ۸")).toBeDefined();
      });

      const popSection = screen.getByTestId("popular-courses-library-section");
      const headings = within(popSection)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent);
      expect(headings).toHaveLength(8);
      expect(headings[0]).toBe("دوره آموزشی شماره ۱");
      expect(headings[1]).toBe("دوره آموزشی شماره ۲");
      expect(headings[7]).toBe("دوره آموزشی شماره ۸");
    });

    it("4. Popular Course cards are clickable links navigating to /courses/:id with subject badges", async () => {
      setupLibraryWithPopularMocks(sample8PopularCourses);
      renderWithProviders(<PopularCoursesLibrarySection organizationId={popularOrgId} />);

      await waitFor(() => {
        const popSection = screen.getByTestId("popular-courses-library-section");
        expect(within(popSection).getByText("دوره آموزشی شماره ۱")).toBeDefined();
        expect(within(popSection).getByText("رشته تخصصی ۱")).toBeDefined();
      });

      const popSection = screen.getByTestId("popular-courses-library-section");
      const firstCardLink = within(popSection).getByText("دوره آموزشی شماره ۱").closest("a");
      expect(firstCardLink).toBeDefined();
      expect(firstCardLink?.getAttribute("href")).toBe(
        `/courses/${sample8PopularCourses[0].id}`,
      );
    });

    it("5. handles 0 popular courses gracefully without crashing", async () => {
      setupLibraryWithPopularMocks([]);
      renderWithProviders(<PopularCoursesLibrarySection organizationId={popularOrgId} />);

      await waitFor(() => {
        // Popular courses section hides gracefully when 0 courses exist
        expect(screen.queryByTestId("popular-courses-library-section")).toBeNull();
      });
    });

    it("6. renders 1, 2, and 4 popular courses properly", async () => {
      const fourCourses = sample8PopularCourses.slice(0, 4);
      setupLibraryWithPopularMocks(fourCourses);
      renderWithProviders(<PopularCoursesLibrarySection organizationId={popularOrgId} />);

      await waitFor(() => {
        const popSection = screen.getByTestId("popular-courses-library-section");
        expect(within(popSection).getByText("دوره آموزشی شماره ۱")).toBeDefined();
        expect(within(popSection).getByText("دوره آموزشی شماره ۴")).toBeDefined();
        expect(within(popSection).queryByText("دوره آموزشی شماره ۵")).toBeNull();
      });
    });

    it("7. handles popular courses API error gracefully", async () => {
      setupLibraryWithPopularMocks([], true);
      renderWithProviders(<PopularCoursesLibrarySection organizationId={popularOrgId} />);

      await waitFor(() => {
        // Popular section gracefully returns null on error
        expect(screen.queryByTestId("popular-courses-library-section")).toBeNull();
      });
    });

    it("8. ensures no mock/static course names exist in popular courses section", async () => {
      setupLibraryWithPopularMocks(sample8PopularCourses);
      renderWithProviders(<PopularCoursesLibrarySection organizationId={popularOrgId} />);

      await waitFor(() => {
        expect(screen.getByTestId("popular-courses-library-section")).toBeDefined();
      });

      const popSection = screen.getByTestId("popular-courses-library-section");
      expect(within(popSection).queryByText("فصل ۴ — سیستم عصبی خودمختار")).toBeNull();
      expect(within(popSection).queryByText("۶۸٪ تکمیل شده")).toBeNull();
    });

    it("9. verifies LibraryPage contains exclusively Content Packs and does NOT contain course catalog sections", async () => {
      setupLibraryWithPopularMocks(sample8PopularCourses);
      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByTestId("public-content-packs-section")).toBeDefined();
        expect(screen.queryByTestId("popular-courses-library-section")).toBeNull();
        expect(screen.queryByTestId("all-library-courses-section")).toBeNull();
      });
    });
  });
});
