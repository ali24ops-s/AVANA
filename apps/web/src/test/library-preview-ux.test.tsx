import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentLibraryCard } from "../components/library/ContentLibraryCard.js";
import { ChapterPackageCard } from "../components/library/ChapterPackageCard.js";
import { ChapterPackageModal } from "../components/library/ChapterPackageModal.js";
import type { LibraryContentItem } from "../lib/api/library.js";
import type { ChapterPackageItem } from "@avana/domain";

// Mock API clients for ChapterPackageModal
const mockGetCourseLearning = vi.fn();
const mockGetCourseFlashcards = vi.fn();
const mockGetCourseQuizzes = vi.fn();
const mockGetCourseQuiz = vi.fn();
const mockSubmitCourseQuizAttempt = vi.fn();

vi.mock("../lib/api/learning.js", () => ({
  createLearningApi: () => ({
    getCourseLearning: mockGetCourseLearning,
  }),
}));

vi.mock("../lib/api/study.js", () => ({
  createStudyApi: () => ({
    getCourseFlashcards: mockGetCourseFlashcards,
    getCourseQuizzes: mockGetCourseQuizzes,
    getCourseQuiz: mockGetCourseQuiz,
    submitCourseQuizAttempt: mockSubmitCourseQuizAttempt,
  }),
}));

describe("Library Free Preview UX & Canonical Integration", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    );
  };

  describe("ContentLibraryCard Free Preview", () => {
    const previewContent: LibraryContentItem = {
      id: "lesson-prev-1",
      lesson_id: "lesson-prev-1",
      course_id: "course-pharma-101",
      title: "درس ۱: مقدمه‌ای بر فارماکولوژی بالینی",
      course_title: "فارماکولوژی جامع",
      module_title: "فصل ۱: کلیات دارو",
      type: "lesson",
      is_preview: true,
      estimated_minutes: 15,
      completed: false,
      access: {
        hasAccess: false,
        isPurchased: false,
        isFree: false,
        accessSource: "none",
      },
      purchase: {
        price: 75000,
        currency: "IRR",
        productId: "prod-pharma-1",
      },
    };

    const paidContentLocked: LibraryContentItem = {
      id: "lesson-locked-2",
      lesson_id: "lesson-locked-2",
      course_id: "course-pharma-101",
      title: "درس ۲: فارماکوکینتیک پیشرفته",
      course_title: "فارماکولوژی جامع",
      module_title: "فصل ۱: کلیات دارو",
      type: "lesson",
      is_preview: false,
      estimated_minutes: 25,
      completed: false,
      access: {
        hasAccess: false,
        isPurchased: false,
        isFree: false,
        accessSource: "none",
      },
      purchase: {
        price: 75000,
        currency: "IRR",
        productId: "prod-pharma-2",
      },
    };

    const purchasedContent: LibraryContentItem = {
      ...paidContentLocked,
      id: "lesson-purchased-3",
      lesson_id: "lesson-purchased-3",
      access: {
        hasAccess: true,
        isPurchased: true,
        isFree: false,
        accessSource: "purchase",
      },
    };

    it("renders exact badge, explanatory copy, and CTA for preview lesson", () => {
      renderWithProviders(<ContentLibraryCard content={previewContent} />);

      // Badge
      expect(screen.getByText("پیش‌نمایش رایگان")).toBeInTheDocument();

      // Explanatory copy
      expect(
        screen.getByText("این محتوا پولی است، اما برای آشنایی یک بخش از آن رایگان است.")
      ).toBeInTheDocument();

      // Exact CTA
      expect(screen.getByText("مشاهده درسنامه رایگان")).toBeInTheDocument();

      // Navigation target
      const link = screen.getByRole("link", { name: /مشاهده درسنامه رایگان/i });
      expect(link).toHaveAttribute("href", "/courses/course-pharma-101?lessonId=lesson-prev-1");
    });

    it("renders locked state and buy CTA for non-preview paid item", () => {
      const onBuy = vi.fn();
      renderWithProviders(<ContentLibraryCard content={paidContentLocked} onBuy={onBuy} />);

      expect(screen.queryByText("پیش‌نمایش رایگان")).not.toBeInTheDocument();
      expect(
        screen.queryByText("این محتوا پولی است، اما برای آشنایی یک بخش از آن رایگان است.")
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("buy-content-btn-lesson-locked-2")).toBeInTheDocument();
    });

    it("renders purchased badge and reading CTA for purchased item", () => {
      renderWithProviders(<ContentLibraryCard content={purchasedContent} />);

      expect(screen.getByText("خریداری شده")).toBeInTheDocument();
      expect(screen.getByText("مطالعه محتوا")).toBeInTheDocument();
    });
  });

  describe("ChapterPackageCard Free Preview", () => {
    const previewPackage: ChapterPackageItem = {
      id: "pkg-pharma-ch1",
      moduleId: "mod-1",
      courseId: "course-pharma-101",
      courseTitle: "فارماکولوژی جامع",
      title: "فصل ۱: مبانی فارماکولوژی",
      description: "بسته آموزشی جامع فصل اول",
      subject: "داروسازی",
      sortOrder: 1,
      documentId: "doc-1",
      contentPackId: "pack-1",
      contents: {
        lesson: { exists: true, count: 2, estimatedMinutes: 20 },
        summary: { exists: true },
        flashcards: { exists: true, count: 20 },
        quiz: { exists: true, questionCount: 10 },
      },
      stats: {
        totalItems: 4,
        lessonCount: 2,
        flashcardCount: 20,
        quizQuestionCount: 10,
        estimatedReadingMinutes: 20,
      },
      completeness: "complete",
      access: {
        hasAccess: false,
        isPurchased: false,
        isFree: false,
        accessSource: "none",
      },
      purchase: {
        price: 120000,
        currency: "IRR",
        productId: "prod-pkg-1",
      },
      preview: {
        hasPreview: true,
        lesson: {
          id: "lesson-prev-1",
          title: "درس ۱: تعاریف اولیه",
          available: true,
        },
        flashcards: {
          available: true,
          previewCount: 5,
        },
        quiz: {
          id: "quiz-prev-1",
          title: "آزمون فصل ۱",
          available: true,
        },
      },
    };

    it("renders package card preview badges and explanatory notice", () => {
      const onView = vi.fn();
      const onBuy = vi.fn();
      renderWithProviders(
        <ChapterPackageCard packageItem={previewPackage} onView={onView} onBuy={onBuy} />
      );

      // Card top badge
      expect(screen.getByTestId("badge-preview")).toHaveTextContent("پیش‌نمایش رایگان");

      // Explanatory notice
      expect(
        screen.getByText("این محتوا پولی است، اما برای آشنایی یک بخش از آن رایگان است.")
      ).toBeInTheDocument();

      // Content item preview badges
      expect(screen.getByTestId("item-lesson")).toHaveTextContent("پیش‌نمایش رایگان");
      expect(screen.getByTestId("item-flashcards")).toHaveTextContent("پیش‌نمایش رایگان (۵ کارت)");
      expect(screen.getByTestId("item-quiz")).toHaveTextContent("پیش‌نمایش رایگان");
    });
  });

  describe("ChapterPackageModal Direct Experience Navigation", () => {
    const packageWithPreview: ChapterPackageItem = {
      id: "pkg-pharma-ch1",
      moduleId: "mod-1",
      courseId: "course-pharma-101",
      courseTitle: "فارماکولوژی جامع",
      title: "فصل ۱: مبانی فارماکولوژی",
      description: "بسته آموزشی جامع فصل اول",
      subject: "داروسازی",
      sortOrder: 1,
      documentId: "doc-1",
      contentPackId: "pack-1",
      contents: {
        lesson: { exists: true, count: 2, estimatedMinutes: 20 },
        summary: { exists: true },
        flashcards: { exists: true, count: 20 },
        quiz: { exists: true, questionCount: 10 },
      },
      stats: {
        totalItems: 4,
        lessonCount: 2,
        flashcardCount: 20,
        quizQuestionCount: 10,
        estimatedReadingMinutes: 20,
      },
      completeness: "complete",
      access: {
        hasAccess: false,
        isPurchased: false,
        isFree: false,
        accessSource: "none",
      },
      purchase: {
        price: 120000,
        currency: "IRR",
        productId: "prod-pkg-1",
      },
      preview: {
        hasPreview: true,
        lesson: {
          id: "lesson-prev-1",
          title: "درس ۱: تعاریف اولیه",
          available: true,
        },
        flashcards: {
          available: true,
          previewCount: 5,
        },
        quiz: {
          id: "quiz-prev-1",
          title: "آزمون فصل ۱",
          available: true,
        },
      },
    };

    const mockLearning = {
      request_id: "req-1",
      course: { id: "course-pharma-101", title: "فارماکولوژی جامع" },
      preview: { is_preview: true, preview_lesson_id: "lesson-prev-1", full_lesson_count: 2 },
      modules: [
        {
          id: "mod-1",
          title: "فصل ۱: کلیات دارو",
          lessons: [
            {
              id: "lesson-prev-1",
              title: "درس ۱: تعاریف اولیه",
              is_preview: true,
              locked: false,
              content_markdown: "# متن درس ۱",
            },
            {
              id: "lesson-locked-2",
              title: "درس ۲: متابولیسم",
              is_preview: false,
              locked: true,
            },
          ],
        },
      ],
    };

    const mockFlashcards = {
      request_id: "req-2",
      is_preview: true,
      total_count: 5,
      flashcards: [
        { id: "fc-1", question: "سؤال کارت ۱", answer: "پاسخ کارت ۱" },
        { id: "fc-2", question: "سؤال کارت ۲", answer: "پاسخ کارت ۲" },
      ],
    };

    const mockQuizzes = {
      request_id: "req-3",
      quizzes: [{ id: "quiz-prev-1", title: "آزمون فصل ۱" }],
    };

    const mockQuizDetail = {
      request_id: "req-4",
      quiz: {
        id: "quiz-prev-1",
        title: "آزمون فصل ۱",
        is_preview: true,
        questions: [
          {
            id: "q-1",
            question: "سوال ۱ آزمون نمونه",
            choices: ["گزینه الف", "گزینه ب", "گزینه ج", "گزینه د"],
          },
        ],
      },
    };

    it("displays explanatory banner and navigation CTA 'مشاهده درسنامه رایگان' in Tab 1", async () => {
      mockGetCourseLearning.mockResolvedValue(mockLearning);

      renderWithProviders(
        <ChapterPackageModal
          open={true}
          packageItem={packageWithPreview}
          onClose={vi.fn()}
          onBuy={vi.fn()}
        />
      );

      // Explanatory banner
      expect(
        screen.getByText("این محتوا پولی است، اما برای آشنایی یک بخش از آن رایگان است.")
      ).toBeInTheDocument();

      // Tab badge
      expect(screen.getByTestId("tab-package-lesson")).toHaveTextContent("پیش‌نمایش رایگان");

      // Wait for lesson loading
      await waitFor(() => {
        expect(screen.getByTestId("btn-view-preview-lesson")).toBeInTheDocument();
      });

      const lessonCta = screen.getByTestId("btn-view-preview-lesson");
      expect(lessonCta).toHaveTextContent("مشاهده درسنامه رایگان");
      expect(lessonCta).toHaveAttribute(
        "href",
        "/courses/course-pharma-101?lessonId=lesson-prev-1"
      );
    });

    it("displays badge 'پیش‌نمایش رایگان (۵ کارت)' and CTA 'مشاهده فلش‌کارت رایگان' in Tab 2", async () => {
      mockGetCourseLearning.mockResolvedValue(mockLearning);
      mockGetCourseFlashcards.mockResolvedValue(mockFlashcards);

      renderWithProviders(
        <ChapterPackageModal
          open={true}
          packageItem={packageWithPreview}
          onClose={vi.fn()}
          onBuy={vi.fn()}
        />
      );

      // Switch to Tab 2
      fireEvent.click(screen.getByTestId("tab-package-flashcard"));

      await waitFor(() => {
        expect(screen.getByTestId("btn-view-preview-flashcards")).toBeInTheDocument();
      });

      const fcCta = screen.getByTestId("btn-view-preview-flashcards");
      expect(fcCta).toHaveTextContent("مشاهده فلش‌کارت رایگان");
      expect(fcCta).toHaveAttribute(
        "href",
        "/courses/course-pharma-101/flashcards?moduleId=mod-1",
      );
    });

    it("displays badge 'پیش‌نمایش رایگان' and CTA 'شرکت در آزمون رایگان' in Tab 3", async () => {
      mockGetCourseLearning.mockResolvedValue(mockLearning);
      mockGetCourseQuizzes.mockResolvedValue(mockQuizzes);
      mockGetCourseQuiz.mockResolvedValue(mockQuizDetail);

      renderWithProviders(
        <ChapterPackageModal
          open={true}
          packageItem={packageWithPreview}
          onClose={vi.fn()}
          onBuy={vi.fn()}
        />
      );

      // Switch to Tab 3
      fireEvent.click(screen.getByTestId("tab-package-quiz"));

      await waitFor(() => {
        expect(screen.getByTestId("btn-view-preview-quiz")).toBeInTheDocument();
      });

      const quizCta = screen.getByTestId("btn-view-preview-quiz");
      expect(quizCta).toHaveTextContent("شرکت در آزمون رایگان");
      expect(quizCta).toHaveAttribute(
        "href",
        "/courses/course-pharma-101/quizzes/quiz-prev-1?moduleId=mod-1",
      );
    });
  });
});
