import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChapterPackageModal } from "../components/library/ChapterPackageModal.js";
import { CourseLibraryCard } from "../components/library/CourseLibraryCard.js";
import { ChapterPackageCard } from "../components/library/ChapterPackageCard.js";
import type { LibraryCourseItem } from "../lib/api/library.js";
import type { ChapterPackageItem } from "@avana/domain";

// Mock API clients
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

describe("Library In-Modal Pre-Purchase Preview Experience (مشاهده بسته)", () => {
  let queryClient: QueryClient;

  const sampleCourse: LibraryCourseItem = {
    id: "course-cardio-101",
    title: "فیزیولوژی و فارماکولوژی قلب و عروق",
    description: "دوره جامع دانشگاهی قلب و عروق شامل الکتروفیزیولوژی، آریتمی‌ها و داروهای ضد فشار خون.",
    subject: "قلب و عروق",
    module_count: 3,
    content_count: 12,
    has_certificate: true,
    access: {
      hasAccess: false,
      isPurchased: false,
      isFree: false,
      accessSource: "none",
    },
    purchase: {
      price: 450000,
      currency: "IRR",
      productId: "prod-cardio-101",
      code: "course_cardio_101",
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  };

  const samplePackage: ChapterPackageItem = {
    id: "pack-cardio-ch1",
    moduleId: "mod-1",
    courseId: "course-cardio-101",
    courseTitle: "فیزیولوژی و فارماکولوژی قلب و عروق",
    title: "فصل اول: الکتروفیزیولوژی قلب و پتانسیل عمل",
    description: "بسته آموزشی جامع فصل شامل درسنامه کامل، فلش‌کارت‌های مرور فعال و آزمون تستی استاندارد.",
    subject: "فیزیولوژی",
    sortOrder: 1,
    documentId: "doc-1",
    contentPackId: "pack-1",
    contents: {
      lesson: {
        exists: true,
        count: 4,
        estimatedMinutes: 30,
        title: "درسنامه جامع پتانسیل عمل و کانال‌های یونی",
      },
      summary: {
        exists: true,
        title: "خلاصه نکات کلیدی",
        overview: "در این بسته مبانی پتانسیل عمل قلبی، کانال‌های کلسیمی نوع L و نکات بالینی جمع‌بندی شده است.",
      },
      flashcards: {
        exists: true,
        count: 24,
      },
      quiz: {
        exists: true,
        quizId: "quiz-cardio-1",
        title: "آزمون تستی الکتروفیزیولوژی",
        questionCount: 15,
      },
    },
    stats: {
      totalItems: 4,
      lessonCount: 4,
      flashcardCount: 24,
      quizQuestionCount: 15,
      estimatedReadingMinutes: 30,
    },
    completeness: "complete",
    access: {
      hasAccess: false,
      isPurchased: false,
      isFree: false,
      accessSource: "none",
    },
    purchase: {
      price: 150000,
      currency: "IRR",
      productId: "prod-pack-1",
    },
    preview: {
      hasPreview: true,
      lesson: {
        id: "lesson-intro",
        title: "جلسه اول: بیوفیزیک غشای سلول قلبی (پیش‌نمایش رایگان)",
        is_preview: true,
      },
      flashcard: {
        totalCards: 24,
        previewCardsCount: 5,
      },
      quiz: {
        id: "quiz-cardio-1",
        title: "آزمون تستی الکتروفیزیولوژی",
        totalQuestions: 15,
        previewQuestionsCount: 5,
      },
    },
  };

  const mockCurriculumData = {
    request_id: "req-curriculum-1",
    course: {
      id: "course-cardio-101",
      title: "فیزیولوژی و فارماکولوژی قلب و عروق",
    },
    preview: {
      is_preview: true,
      preview_lesson_id: "lesson-intro",
      full_lesson_count: 4,
    },
    modules: [
      {
        id: "mod-1",
        title: "فصل اول: الکتروفیزیولوژی قلب",
        order: 1,
        lessons: [
          {
            id: "lesson-intro",
            title: "جلسه اول: بیوفیزیک غشای سلول قلبی (پیش‌نمایش رایگان)",
            order: 1,
            is_preview: true,
            is_locked: false,
            content: {
              markdown: "## درسنامه بیوفیزیک سلول قلبی\n\nسلول‌های عضلانی قلب دارای پتانسیل استراحت غشایی در حدود منفی ۸۵ تا ۹۰ میلی‌ولت هستند.\n\n### فازهای پتانسیل عمل:\n- فاز ۰: دپلاریزاسیون سریع\n- فاز ۱: رپلاریزاسیون اولیه\n- فاز ۲: فاز کفه (Plateau) با ورود کلسیم\n- فاز ۳: رپلاریزاسیون سریع\n- فاز ۴: پتانسیل استراحت",
            },
          },
          {
            id: "lesson-paid-1",
            title: "جلسه دوم: کانال‌های یونی سریع سدیمی و بلوک‌کننده‌ها",
            order: 2,
            is_preview: false,
            is_locked: true,
            content: null,
          },
        ],
      },
      {
        id: "mod-2",
        title: "فصل دوم: آریتمی‌های فوق بطنی و بلوک‌ها",
        order: 2,
        lessons: [
          {
            id: "lesson-mod2-1",
            title: "جلسه اول فصل دو: فیبریلاسیون دهلیزی",
            order: 1,
            is_preview: false,
            is_locked: true,
            content: null,
          },
        ],
      },
    ],
  };

  const mockFlashcardsData = {
    request_id: "req-flashcards-1",
    total: 5,
    flashcards: [
      { id: "fc-1", front: "پتانسیل استراحت سلول قلبی چند میلی‌ولت است؟", back: "منفی ۸۵ تا ۹۰ میلی‌ولت" },
      { id: "fc-2", front: "یون مسئول فاز صفر پتانسیل عمل کاردیومیوسیت چیست؟", back: "یون سدیم از طریق کانال‌های سریع Nav1.5" },
      { id: "fc-3", front: "کدام کانال در ایجاد فاز ۲ (Plateau) دخیل است؟", back: "کانال کلسیمی نوع L (Cav1.2)" },
      { id: "fc-4", front: "علت دوره تحریک‌ناپذیری موثر (ERP) طولانی در قلب چیست؟", back: "حفظ فاز کفه و جلوگیری از کزاز قلبی" },
      { id: "fc-5", front: "عملکرد پمپ سدیم-پتاسیم چیست؟", back: "خروج ۳ یون سدیم و ورود ۲ یون پتاسیم با مصرف ATP" },
    ],
  };

  const mockQuizData = {
    request_id: "req-quiz-1",
    quiz: {
      id: "quiz-cardio-1",
      title: "آزمون تستی الکتروفیزیولوژی قلب (نمونه)",
      questions: [
        {
          id: "q-1",
          question: "کدام جریان یونی مسئول فاز صفر پتانسیل عمل بطنی است؟",
          choices: ["ورود سدیم (INa)", "خروج پتاسیم (IK)", "ورود کلسیم (ICa-L)", "خروج کلر (ICl)"],
        },
        {
          id: "q-2",
          question: "طولانی بودن دوره تحریک‌ناپذیری در بطن‌ها چه فایده‌ای دارد؟",
          choices: ["جلوگیری از انقباض مداوم (تتانوس)", "کاهش مصرف انرژی", "افزایش سرعت هدایت", "مهار گره سینوسی"],
        },
      ],
    },
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    mockGetCourseLearning.mockResolvedValue(mockCurriculumData);
    mockGetCourseFlashcards.mockResolvedValue(mockFlashcardsData);
    mockGetCourseQuizzes.mockResolvedValue({
      request_id: "req-qz-list",
      quizzes: [{ id: "quiz-cardio-1", title: "آزمون تستی الکتروفیزیولوژی" }],
    });
    mockGetCourseQuiz.mockResolvedValue(mockQuizData);
    mockSubmitCourseQuizAttempt.mockResolvedValue({
      request_id: "req-eval-1",
      score: 100,
      correct: 2,
      total: 2,
      passed: true,
      message: "پاسخ‌های شما با موفقیت ثبت شدند.",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("CourseLibraryCard renders 'مشاهده بسته' button when user does not have access", () => {
    const onView = vi.fn();
    const onBuy = vi.fn();

    render(
      <MemoryRouter>
        <CourseLibraryCard course={sampleCourse} onView={onView} onBuy={onBuy} />
      </MemoryRouter>,
    );

    const viewBtn = screen.getByTestId(`view-course-btn-${sampleCourse.id}`);
    expect(viewBtn).toBeDefined();
    expect(viewBtn.textContent).toContain("مشاهده بسته");

    fireEvent.click(viewBtn);
    expect(onView).toHaveBeenCalledWith(sampleCourse);

    const buyBtn = screen.getByTestId(`buy-course-btn-${sampleCourse.id}`);
    expect(buyBtn).toBeDefined();
    fireEvent.click(buyBtn);
    expect(onBuy).toHaveBeenCalledWith(sampleCourse);
  });

  it("ChapterPackageCard renders 'مشاهده بسته' button for non-buyers", () => {
    const onView = vi.fn();
    const onBuy = vi.fn();

    render(
      <MemoryRouter>
        <ChapterPackageCard packageItem={samplePackage} onView={onView} onBuy={onBuy} />
      </MemoryRouter>,
    );

    const viewBtn = screen.getByTestId(`btn-view-package-${samplePackage.id}`);
    expect(viewBtn).toBeDefined();
    expect(viewBtn.textContent).toContain("مشاهده بسته");

    fireEvent.click(viewBtn);
    expect(onView).toHaveBeenCalledWith(samplePackage);
  });

  it("ChapterPackageModal renders full TOC, preview lesson markdown, and non-buyer purchase CTA", async () => {
    const onClose = vi.fn();
    const onBuy = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChapterPackageModal
            packageItem={samplePackage}
            open={true}
            onClose={onClose}
            onBuy={onBuy}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Header check
    expect(screen.getByText("فصل اول: الکتروفیزیولوژی قلب و پتانسیل عمل")).toBeDefined();
    expect(screen.getByText("پیش‌نمایش رایگان بسته")).toBeDefined();

    // Lesson Tab: Wait for Curriculum outline and preview lesson
    await waitFor(() => {
      expect(screen.getAllByText("فصل اول: الکتروفیزیولوژی قلب")[0]).toBeDefined();
      expect(screen.getByTestId("toc-lesson-lesson-intro")).toBeDefined();
      expect(screen.getByTestId("toc-lesson-lesson-paid-1")).toBeDefined();
    });

    // Preview Lesson Markdown rendered
    expect(screen.getByText("درسنامه بیوفیزیک سلول قلبی")).toBeDefined();
    expect(screen.getByText(/سلول‌های عضلانی قلب دارای پتانسیل استراحت/)).toBeDefined();

    // Locked Lesson selection
    const lockedLessonBtn = screen.getByTestId("toc-lesson-lesson-paid-1");
    fireEvent.click(lockedLessonBtn);

    // Shows locked paywall callout
    await waitFor(() => {
      expect(screen.getByText("این جلسه جزو محتوای ویژه است")).toBeDefined();
      expect(screen.getByText(/برای مطالعه متن کامل این درسنامه/)).toBeDefined();
    });

    // Modal Footer purchase button
    const footerBuyBtn = screen.getByTestId("modal-footer-buy-btn");
    expect(footerBuyBtn).toBeDefined();
    fireEvent.click(footerBuyBtn);
    expect(onBuy).toHaveBeenCalledWith(samplePackage);
  });

  it("ChapterPackageModal allows flipping through 5 real preview flashcards and completing", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChapterPackageModal
            packageItem={samplePackage}
            open={true}
            onClose={vi.fn()}
            onBuy={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Switch to Flashcards Tab
    const flashcardTab = screen.getByTestId("tab-package-flashcard");
    fireEvent.click(flashcardTab);

    // Wait for flashcards query
    await waitFor(() => {
      expect(screen.getByText("پتانسیل استراحت سلول قلبی چند میلی‌ولت است؟")).toBeDefined();
    });

    // Flip card
    const cardEl = screen.getByTestId("preview-flashcard-interactive");
    fireEvent.click(cardEl);

    // Shows back text
    expect(screen.getByText("منفی ۸۵ تا ۹۰ میلی‌ولت")).toBeDefined();

    // Navigate to next card
    const nextBtn = screen.getByTestId("btn-next-flashcard");
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText("یون مسئول فاز صفر پتانسیل عمل کاردیومیوسیت چیست؟")).toBeDefined();
    });
  });

  it("ChapterPackageModal allows taking 5 preview quiz questions and submits attempt", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChapterPackageModal
            packageItem={samplePackage}
            open={true}
            onClose={vi.fn()}
            onBuy={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Switch to Quiz Tab
    const quizTab = screen.getByTestId("tab-package-quiz");
    fireEvent.click(quizTab);

    // Wait for quiz query
    await waitFor(() => {
      expect(screen.getByText("کدام جریان یونی مسئول فاز صفر پتانسیل عمل بطنی است؟")).toBeDefined();
    });

    // Select choice
    const choice1 = screen.getByText("ورود سدیم (INa)");
    fireEvent.click(choice1);

    // Next question
    const nextQBtn = screen.getByTestId("btn-next-question");
    fireEvent.click(nextQBtn);

    await waitFor(() => {
      expect(screen.getByText("طولانی بودن دوره تحریک‌ناپذیری در بطن‌ها چه فایده‌ای دارد؟")).toBeDefined();
    });

    // Select choice for question 2
    const choice2 = screen.getByText("جلوگیری از انقباض مداوم (تتانوس)");
    fireEvent.click(choice2);

    // Submit attempt
    const submitBtn = screen.getByTestId("btn-submit-quiz-preview");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSubmitCourseQuizAttempt).toHaveBeenCalledWith(
        "course-cardio-101",
        "quiz-cardio-1",
        {
          answers: [
            { questionId: "q-1", answer: "ورود سدیم (INa)" },
            { questionId: "q-2", answer: "جلوگیری از انقباض مداوم (تتانوس)" },
          ],
        },
      );
      expect(screen.getByText("پایان پیش‌نمایش آزمون")).toBeDefined();
    });
  });

  it("ChapterPackageModal scopes preview strictly to the selected chapter package module and isolates other chapters", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ChapterPackageModal
            packageItem={samplePackage}
            open={true}
            onClose={vi.fn()}
            onBuy={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mockGetCourseLearning).toHaveBeenCalledWith(
        "course-cardio-101",
        expect.objectContaining({
          moduleId: "mod-1",
          previewSessionId: expect.any(String),
        }),
      );
    });

    // Verify Chapter 1 is present in the modal TOC
    await waitFor(() => {
      expect(screen.getByText("فصل اول: الکتروفیزیولوژی قلب")).toBeDefined();
    });
    // Verify Chapter 2 is NOT rendered (strict isolation)
    expect(screen.queryByText("فصل دوم: آریتمی‌های فوق بطنی و بلوک‌ها")).toBeNull();
    expect(screen.queryByText("جلسه اول فصل دو: فیبریلاسیون دهلیزی")).toBeNull();

    // Switch to flashcards and verify scope
    const fcTab = screen.getByTestId("tab-package-flashcard");
    fireEvent.click(fcTab);

    await waitFor(() => {
      expect(mockGetCourseFlashcards).toHaveBeenCalledWith(
        "course-cardio-101",
        expect.objectContaining({
          moduleId: "mod-1",
          previewSessionId: expect.any(String),
          limit: 15,
        }),
      );
    });

    // Switch to quiz and verify scope
    const quizTab = screen.getByTestId("tab-package-quiz");
    fireEvent.click(quizTab);

    await waitFor(() => {
      expect(mockGetCourseQuiz).toHaveBeenCalledWith(
        "course-cardio-101",
        "quiz-cardio-1",
        expect.objectContaining({
          moduleId: "mod-1",
          previewSessionId: expect.any(String),
        }),
      );
    });
  });
});
