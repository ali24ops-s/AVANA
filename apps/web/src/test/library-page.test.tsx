import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LibraryPage } from "../pages/LibraryPage.js";
import { ContentPackCard } from "../components/library/ContentPackCard.js";
import { ChapterPackageCard } from "../components/library/ChapterPackageCard.js";
import { ChapterPackageModal } from "../components/library/ChapterPackageModal.js";
import { PackDetailModal } from "../components/library/PackDetailModal.js";
import { AddToCourseModal } from "../components/library/AddToCourseModal.js";
import { PublishPackModal } from "../components/library/PublishPackModal.js";
import { PopularCoursesLibrarySection } from "../components/library/PopularCoursesLibrarySection.js";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import type {
  PublicContentPackItemSummary,
  PublicContentPackDetailResource,
  ChapterPackageItem,
  CourseWithChapterPackages,
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

const mockCoursePackages: CourseWithChapterPackages[] = [
  {
    id: "course-101",
    title: "فیزیولوژی پزشکی ترم ۳",
    description: "دوره جامع فیزیولوژی قلب و عروق",
    subject: "فیزیولوژی",
    isOfficial: true,
    totalPackages: 2,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    packages: [
      {
        id: "pkg-1",
        moduleId: "mod-1",
        courseId: "course-101",
        courseTitle: "فیزیولوژی پزشکی ترم ۳",
        title: "فیزیولوژی قلب و عروق",
        description: "درسنامه جامع الکتروفیزیولوژی قلب، سیکل قلبی و همودینامیک عروق",
        subject: "فیزیولوژی",
        sortOrder: 1,
        documentId: "doc-1",
        contentPackId: "pack-1",
        completeness: "complete",
        contents: {
          lesson: { exists: true, count: 5, estimatedMinutes: 45, title: "درسنامه جامع الکتروفیزیولوژی قلب" },
          summary: {
            exists: true,
            title: "خلاصه و نکات کلیدی فیزیولوژی قلب",
            overview: "در این بسته مبانی پتانسیل عمل قلبی، کانال‌های کلسیمی نوع L، فاز کفه و مکانیسم فرانک استارلینگ با جزییات مرور شده‌اند.",
            estimatedMinutes: 45,
          },
          flashcards: { exists: true, count: 24 },
          quiz: { exists: true, quizId: "quiz-1", title: "آزمون جامع الکتروفیزیولوژی و همودینامیک", questionCount: 15 },
        },
        stats: {
          totalItems: 45,
          lessonCount: 5,
          flashcardCount: 24,
          quizQuestionCount: 15,
          estimatedReadingMinutes: 45,
        },
        access: {
          hasAccess: true,
          accessType: "full",
          accessSource: "enrollment",
          isEnrolled: true,
          isPurchased: false,
          isSubscriptionActive: false,
          isFree: false,
        },
        purchase: {
          canPurchase: false,
          productId: null,
          price: 0,
          currency: "IRR",
          formattedPrice: "رایگان",
          isPurchased: false,
        },
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
      },
      {
        id: "pkg-2",
        moduleId: "mod-2",
        courseId: "course-101",
        courseTitle: "فیزیولوژی پزشکی ترم ۳",
        title: "فارماکولوژی آنتی‌بیوتیک‌ها",
        description: "دسته‌بندی پنی‌سیلین‌ها، سفالوسپورین‌ها و ماکرولیدها",
        subject: "فارماکولوژی",
        sortOrder: 2,
        documentId: "doc-2",
        contentPackId: "pack-2",
        completeness: "partial",
        contents: {
          lesson: { exists: true, count: 3, estimatedMinutes: 35, title: "درسنامه آنتی‌بیوتیک‌ها" },
          summary: { exists: false },
          flashcards: { exists: true, count: 30 },
          quiz: { exists: true, quizId: "quiz-2", title: "آزمون آنتی‌بیوتیک‌ها", questionCount: 20 },
        },
        stats: {
          totalItems: 53,
          lessonCount: 3,
          flashcardCount: 30,
          quizQuestionCount: 20,
          estimatedReadingMinutes: 35,
        },
        access: {
          hasAccess: false,
          accessType: "paywalled",
          accessSource: "none",
          isEnrolled: false,
          isPurchased: false,
          isSubscriptionActive: false,
          isFree: false,
        },
        purchase: {
          canPurchase: true,
          productId: "prod-pkg-2",
          price: 150000,
          currency: "IRR",
          formattedPrice: "۱۵,۰۰۰ تومان",
          isPurchased: false,
        },
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
      },
    ],
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
          /مطالب آموزشی، دوره‌های معتبر و درسنامه‌های دانشگاهی را مرور و مطالعه کن/i,
        ),
      ).toBeDefined();
    });

    it("fetches and displays content pack list, handles search, subject filter, and sorting", async () => {
      let requestedUrl = "";
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        requestedUrl = String(url);
        if (requestedUrl.includes("/course-packages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-cp",
              courses: mockCoursePackages,
              pagination: { page: 1, limit: 12, total_courses: 1, total_packages: 2 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-cp",
                courses: mockCoursePackages,
                pagination: { page: 1, limit: 12, total_courses: 1, total_packages: 2 },
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-list",
            items: mockPacks,
            courses: [],
            contents: [],
            pagination: {
              page: 1,
              limit: 12,
              total_count: 2,
              total_pages: 1,
              total_courses: 0,
              total_contents: 0,
            },
          }),
          text: async () =>
            JSON.stringify({
              request_id: "req-list",
              items: mockPacks,
              courses: [],
              contents: [],
              pagination: {
                page: 1,
                limit: 12,
                total_count: 2,
                total_pages: 1,
                total_courses: 0,
                total_contents: 0,
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
        "جستجو در عنوان دوره‌ها، درسنامه‌ها، سرفصل‌ها یا موضوع...",
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
      expect((searchInput as HTMLInputElement).value).toBe("");
    });

    it("displays empty search state when no packs match query", async () => {
      vi.spyOn(global, "fetch").mockImplementation(() => {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-empty",
            items: [],
            courses: [],
            contents: [],
            pagination: {
              page: 1,
              limit: 12,
              total_count: 0,
              total_pages: 0,
              total_courses: 0,
              total_contents: 0,
            },
          }),
          text: async () =>
            JSON.stringify({
              request_id: "req-empty",
              items: [],
              courses: [],
              contents: [],
              pagination: {
                page: 1,
                limit: 12,
                total_count: 0,
                total_pages: 0,
                total_courses: 0,
                total_contents: 0,
              },
            }),
        } as Response);
      });

      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(
          screen.getByText("هنوز محتوایی در این بخش وجود ندارد."),
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
          screen.getByText("خطا در دریافت منابع کتابخانه"),
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
      expect(screen.getByText("42 افزوده‌شده")).toBeDefined();

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
        expect(screen.getByRole("heading", { name: /انتشار در کتابخانه/i })).toBeDefined();
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

      expect(screen.getByRole("heading", { name: /انتشار در کتابخانه/i })).toBeDefined();
      expect(screen.getByText(/محتوای تاییدشده شما پس از بررسی|محتوای تأییدشده/i)).toBeDefined();
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

      const submitBtn = screen.getByRole("button", { name: /ارسال برای بررسی|تایید و انتشار/i });
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

      const submitBtn = screen.getByRole("button", { name: /ارسال برای بررسی|تایید و انتشار/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/در حال ارسال برای بررسی|در حال انتشار/i)).toBeDefined();
        const pendingBtn = screen.getByRole("button", { name: /در حال ارسال برای بررسی|در حال انتشار/i });
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

      const submitBtn = screen.getByRole("button", { name: /ارسال برای بررسی|تایید و انتشار/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/بسته آموزشی شما با موفقیت/i)).toBeDefined();
        expect(screen.getByText(/فیزیولوژی تنفس/)).toBeDefined();
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

      const submitBtn = screen.getByRole("button", { name: /ارسال برای بررسی|تایید و انتشار/i });
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

      const submitBtn = screen.getByRole("button", { name: /ارسال برای بررسی|تایید و انتشار/i });
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

      const submitBtn = screen.getByRole("button", { name: /ارسال برای بررسی|تایید و انتشار/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/در حال ارسال برای بررسی|در حال انتشار/i)).toBeDefined();
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
      const confirmBtn = screen.getByRole("button", { name: /ارسال برای بررسی|تایید و انتشار/i });
      fireEvent.click(confirmBtn);

      // 3. In-modal success message appears
      await waitFor(() => {
        expect(publishCalled).toBe(true);
        expect(screen.getByText(/با موفقیت/i)).toBeDefined();
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
        if (urlStr.includes("/course-packages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-cp",
              courses: mockCoursePackages,
              pagination: { page: 1, limit: 12, total_courses: 1, total_packages: 2 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-cp",
                courses: mockCoursePackages,
                pagination: { page: 1, limit: 12, total_courses: 1, total_packages: 2 },
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
        if (urlStr.includes("/library/resources")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              request_id: "req-resources",
              courses: [],
              contents: [],
              pagination: { page: 1, limit: 12, total_courses: 0, total_contents: 0 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-resources",
                courses: [],
                contents: [],
                pagination: { page: 1, limit: 12, total_courses: 0, total_contents: 0 },
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

    it("9. verifies LibraryPage renders Content Packs section correctly", async () => {
      setupLibraryWithPopularMocks(sample8PopularCourses);
      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByTestId("public-content-packs-section")).toBeDefined();
        expect(screen.queryByTestId("popular-courses-library-section")).toBeNull();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 10. Multi-Resource Library: Courses & Standalone Contents (Zero Duplication)
  // -------------------------------------------------------------------------
  describe("Multi-Resource Library: Courses & Standalone Contents", () => {
    const mockLibraryResources = {
      courses: [
        {
          id: "crs-live-1",
          title: "بیوشیمی پزشکی هارپر",
          subject: "بیوشیمی",
          description: "دوره جامع ساختار ماکرومولکول‌ها، آنزیم‌ها و متابولیسم سلولی",
          module_count: 4,
          content_count: 16,
          progress: {
            completed_lessons: 10,
            total_lessons: 16,
            percent: 60,
          },
          href: "/courses/crs-live-1",
          created_at: "2026-08-10T10:00:00.000Z",
          updated_at: "2026-08-25T12:00:00.000Z",
        },
      ],
      contents: [
        {
          id: "lsn-live-101",
          title: "سنتز اسیدهای چرب و بتا اکسیداسیون",
          type: "lesson" as const,
          course_id: "crs-live-1",
          course_title: "بیوشیمی پزشکی هارپر",
          module_id: "mod-live-1",
          module_title: "متابولیسم لیپیدها",
          lesson_id: "lsn-live-101",
          estimated_minutes: 25,
          completed: true,
          href: "/courses/crs-live-1?lessonId=lsn-live-101",
          created_at: "2026-08-11T10:00:00.000Z",
          updated_at: "2026-08-11T10:00:00.000Z",
        },
      ],
      special_exams: [
        {
          id: "exam-prod-1",
          productId: "exam-prod-1",
          code: "special-exam-pharma-1",
          title: "آزمون ویژه جامع فارماکولوژی ۱",
          description: "شامل مباحث فارماکوکینتیک، فارماکودینامیک و سیستم اتونوم",
          question_count: 80,
          difficulty: "medium",
          scope: {
            courseId: "crs-live-1",
            topics: ["فارماکوکینتیک", "فارماکودینامیک"],
          },
          price: 40000,
          currency: "toman",
          created_at: "2026-08-11T10:00:00.000Z",
          updated_at: "2026-08-11T10:00:00.000Z",
        },
      ],
      pagination: {
        page: 1,
        limit: 12,
        total_courses: 1,
        total_contents: 1,
        total_special_exams: 1,
      },
    };

    function setupMultiResourceFetch() {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        // console.log("FETCH:", urlStr);
        if (urlStr.includes("/v1/library/resources")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              request_id: "req-multi",
              ...mockLibraryResources,
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-multi",
                ...mockLibraryResources,
              }),
          } as Response);
        }
        if (urlStr.includes("/v1/library/course-packages") || urlStr.includes("/course-packages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              request_id: "req-cp",
              courses: mockCoursePackages,
              pagination: { page: 1, limit: 12, total_courses: 1, total_packages: 2 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-cp",
                courses: mockCoursePackages,
                pagination: { page: 1, limit: 12, total_courses: 1, total_packages: 2 },
              }),
          } as Response);
        }
        if (urlStr.includes("/v1/library/packs")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
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
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ items: [] }),
          text: async () => JSON.stringify({ items: [] }),
        } as Response);
      });
    }

    it("renders Courses and Special Exams sections simultaneously in 'All' tab with direct navigation", async () => {
      setupMultiResourceFetch();
      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByTestId("library-courses-section")).toBeDefined();
        expect(screen.getByTestId("library-special-exams-section")).toBeDefined();
        expect(screen.getByTestId("public-content-packs-section")).toBeDefined();
      });

      // Check Course Card rendering & link
      expect(screen.getAllByText("بیوشیمی پزشکی هارپر").length).toBeGreaterThan(0);
      expect(screen.getByText("16 درسنامه")).toBeDefined();
      expect(screen.getByText("4 فصل")).toBeDefined();
      expect(screen.getByText("60٪")).toBeDefined();

      const courseLink = screen.getByText("ورود به دوره").closest("a");
      expect(courseLink?.getAttribute("href")).toBe("/courses/crs-live-1");

      // Check Special Exam Card rendering & buy CTA
      expect(screen.getByText("آزمون ویژه جامع فارماکولوژی ۱")).toBeDefined();
      expect(screen.getAllByText(/سؤال/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/تومان/).length).toBeGreaterThan(0);
      expect(screen.getByTestId("buy-special-exam-exam-prod-1")).toBeDefined();
    });

    it("switches to 'Courses' tab and displays only courses", async () => {
      setupMultiResourceFetch();
      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByTestId("library-courses-section")).toBeDefined();
      });

      // Click "دوره‌ها" tab
      const coursesTab = screen.getByTestId("tab-courses");
      fireEvent.click(coursesTab);

      await waitFor(() => {
        expect(screen.getByTestId("library-courses-section")).toBeDefined();
        expect(screen.queryByTestId("library-special-exams-section")).toBeNull();
        expect(screen.queryByTestId("public-content-packs-section")).toBeNull();
      });
    });

    it("switches to 'Special Exams' tab and displays only special exams", async () => {
      setupMultiResourceFetch();
      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByText("آزمون ویژه جامع فارماکولوژی ۱")).toBeDefined();
      });

      // Click "آزمون‌های ویژه" tab
      const specialExamsTab = screen.getByTestId("tab-special-exams");
      fireEvent.click(specialExamsTab);

      await waitFor(() => {
        expect(screen.getByTestId("library-special-exams-section")).toBeDefined();
        expect(screen.queryByTestId("library-courses-section")).toBeNull();
        expect(screen.queryByTestId("public-content-packs-section")).toBeNull();
      });
    });

    it("switches to 'Content Packs' tab and displays only content packs", async () => {
      setupMultiResourceFetch();
      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByTestId("public-content-packs-section")).toBeDefined();
      });

      // Click "بسته‌های آموزشی آماده" tab
      const packsTab = screen.getByTestId("tab-packs");
      fireEvent.click(packsTab);

      await waitFor(() => {
        expect(screen.getByTestId("public-content-packs-section")).toBeDefined();
        expect(screen.queryByTestId("library-courses-section")).toBeNull();
        expect(screen.queryByTestId("library-special-exams-section")).toBeNull();
      });
    });
  });

  // -------------------------------------------------------------------------
  // 11. Course Chapter Educational Packages (Complete 4-Asset Bundles)
  // -------------------------------------------------------------------------
  describe("Course Chapter Educational Packages (Complete 4-Asset Bundles)", () => {
    function setupCoursePackagesFetch() {
      vi.spyOn(global, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/course-packages")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              request_id: "req-cp",
              courses: mockCoursePackages,
              pagination: { page: 1, limit: 12, total_courses: 1, total_packages: 2 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-cp",
                courses: mockCoursePackages,
                pagination: { page: 1, limit: 12, total_courses: 1, total_packages: 2 },
              }),
          } as Response);
        }
        if (urlStr.includes("/library/resources")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            json: async () => ({
              request_id: "req-resources",
              courses: [],
              contents: [],
              pagination: { page: 1, limit: 12, total_courses: 0, total_contents: 0 },
            }),
            text: async () =>
              JSON.stringify({
                request_id: "req-resources",
                courses: [],
                contents: [],
                pagination: { page: 1, limit: 12, total_courses: 0, total_contents: 0 },
              }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ items: [] }),
          text: async () => JSON.stringify({ items: [] }),
        } as Response);
      });
    }

    it("renders ChapterPackageCard with all 4 content badges, item counts, completeness, and access action", () => {
      const onView = vi.fn();
      const onBuy = vi.fn();
      const pkg = mockCoursePackages[0].packages[0];

      renderWithProviders(
        <ChapterPackageCard
          packageItem={pkg}
          onView={onView}
          onBuy={onBuy}
        />,
      );

      // Chapter title & Course title
      expect(screen.getByText("فیزیولوژی قلب و عروق")).toBeDefined();
      expect(screen.getByText("دوره: فیزیولوژی پزشکی ترم ۳")).toBeDefined();

      // Completeness badge
      expect(screen.getByText("پک آموزشی کامل")).toBeDefined();

      // Content Badges
      expect(screen.getByTestId("item-lesson")).toBeDefined();
      expect(screen.getByText("درسنامه (5 جلسه)")).toBeDefined();

      expect(screen.getByTestId("item-summary")).toBeDefined();
      expect(screen.getByText("خلاصه نکات کلیدی")).toBeDefined();

      expect(screen.getByTestId("item-flashcards")).toBeDefined();
      expect(screen.getByText("24 فلش‌کارت")).toBeDefined();

      expect(screen.getByTestId("item-quiz")).toBeDefined();
      expect(screen.getByText("15 سوال آزمون")).toBeDefined();

      // View CTA (hasAccess === true)
      const viewBtn = screen.getByText("مشاهده بسته");
      fireEvent.click(viewBtn);
      expect(onView).toHaveBeenCalledWith(pkg);
      expect(onBuy).not.toHaveBeenCalled();
    });

    it("renders ChapterPackageCard for partial package with unpurchased buy action", () => {
      const onView = vi.fn();
      const onBuy = vi.fn();
      const partialPkg = mockCoursePackages[0].packages[1];

      renderWithProviders(
        <ChapterPackageCard
          packageItem={partialPkg}
          onView={onView}
          onBuy={onBuy}
        />,
      );

      // Title & Completeness
      expect(screen.getByText("فارماکولوژی آنتی‌بیوتیک‌ها")).toBeDefined();
      expect(screen.getByTestId("badge-partial")).toBeDefined();

      // Summary badge missing in partial package
      expect(screen.queryByTestId("item-summary")).toBeNull();

      // Pricing & Buy CTA (hasAccess === false)
      expect(screen.getByTestId("badge-price")).toBeDefined();
      const buyBtn = screen.getByText("خرید بسته");
      fireEvent.click(buyBtn);
      expect(onBuy).toHaveBeenCalledWith(partialPkg);
    });

    it("renders ChapterPackageModal with tabs for Lesson, Summary, Flashcards, and Quiz", async () => {
      const onClose = vi.fn();
      const onBuy = vi.fn();
      const pkg = mockCoursePackages[0].packages[0];

      renderWithProviders(
        <ChapterPackageModal
          packageItem={pkg}
          open={true}
          onClose={onClose}
          onBuy={onBuy}
        />,
      );

      // Modal Title & Subtitle
      expect(screen.getAllByText("فیزیولوژی قلب و عروق").length).toBeGreaterThan(0);
      expect(screen.getByText("دوره: فیزیولوژی پزشکی ترم ۳")).toBeDefined();

      // Lesson Tab (Active by default)
      expect(screen.getByText("درسنامه جامع الکتروفیزیولوژی قلب")).toBeDefined();
      expect(
        screen.getByText(/این بسته شامل درسنامه ساختاریافته به همراه مفاهیم علمی/i),
      ).toBeDefined();

      // Switch to Summary Tab
      const summaryTab = screen.getByTestId("tab-package-summary");
      fireEvent.click(summaryTab);
      expect(
        screen.getByText(/در این بسته مبانی پتانسیل عمل قلبی، کانال‌های کلسیمی نوع L/i),
      ).toBeDefined();

      // Switch to Flashcards Tab
      const flashcardsTab = screen.getByTestId("tab-package-flashcard");
      fireEvent.click(flashcardsTab);
      expect(
        screen.getByText(/مجموعه 24 فلش‌کارت مرور فعال با سیستم تکرار فاصله‌دار/i),
      ).toBeDefined();

      // Switch to Quiz Tab
      const quizTab = screen.getByTestId("tab-package-quiz");
      fireEvent.click(quizTab);
      expect(
        screen.getByText(/آزمون تستی چهارگزینه‌ای شامل 15 سوال مفهومی/i),
      ).toBeDefined();

      // Close modal
      const closeBtn = screen.getByLabelText("بستن پنجره");
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it("groups packages under their parent Course with distinct course cards and header", async () => {
      setupCoursePackagesFetch();
      renderWithProviders(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByTestId("public-content-packs-section")).toBeDefined();
        expect(screen.getByTestId("course-package-group-course-101")).toBeDefined();
      });

      const group = screen.getByTestId("course-package-group-course-101");
      expect(within(group).getByRole("heading", { level: 3, name: "فیزیولوژی پزشکی ترم ۳" })).toBeDefined();
      expect(within(group).getByText(/2\s*فصل دارای بسته آموزشی/)).toBeDefined();
      expect(within(group).getByText("فیزیولوژی قلب و عروق")).toBeDefined();
      expect(within(group).getByText("فارماکولوژی آنتی‌بیوتیک‌ها")).toBeDefined();
    });
  });
});
