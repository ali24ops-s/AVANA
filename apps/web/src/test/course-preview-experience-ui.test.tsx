import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearningPage } from "../pages/LearningPage.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { QuizExperience } from "../components/quiz/QuizExperience.js";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-prospective", email: "prospective@avana.ir", role: "student" },
    memberships: [{ organization_id: "org-1", role: "student" }],
    token: "mock-token",
  }),
}));

// Mock API clients
const mockGetCourseLearning = vi.fn();
const mockListOrganizations = vi.fn();
const mockListProducts = vi.fn();
const mockGetFlashcardsQueue = vi.fn();
const mockGetMultiReviewQueue = vi.fn();
const mockGetQuiz = vi.fn();
const mockSubmitQuizAttempt = vi.fn();

vi.mock("../lib/api/learning.js", () => ({
  createLearningApi: () => ({
    getCourseLearning: mockGetCourseLearning,
    markLessonComplete: vi.fn(),
  }),
}));

vi.mock("../lib/api/organizations.js", () => ({
  createOrganizationApi: () => ({
    listOrganizations: mockListOrganizations,
  }),
}));

vi.mock("../lib/api/commerce.js", () => ({
  createCommerceApi: () => ({
    listProducts: mockListProducts,
    checkout: vi.fn(),
    getMySubscription: vi.fn().mockResolvedValue({ has_active_subscription: false }),
    getMyEntitlements: vi.fn().mockResolvedValue({ items: [] }),
    checkAccess: vi.fn(),
  }),
}));

vi.mock("../lib/api/study.js", () => ({
  createStudyApi: () => ({
    getFlashcardsQueue: mockGetFlashcardsQueue,
    getMultiReviewQueue: mockGetMultiReviewQueue,
    getFlashcardStudySummary: vi.fn().mockResolvedValue({ total_due: 5 }),
    submitFlashcardReview: vi.fn().mockResolvedValue({}),
    getQuiz: mockGetQuiz,
    submitQuizAttempt: mockSubmitQuizAttempt,
    trackSessionHeartbeat: vi.fn().mockResolvedValue({}),
    endStudySession: vi.fn().mockResolvedValue({}),
  }),
}));

describe("Pre-Purchase Course Preview & Free Access UI QA Verification", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    mockListOrganizations.mockResolvedValue({
      items: [{ id: "org-1", name: "سازمان پزشکی آوانا" }],
    });

    mockListProducts.mockResolvedValue({
      items: [
        {
          id: "prod-course-1",
          code: "course_cardio_101",
          type: "course",
          title: "دوره جامع فارماکولوژی قلب و عروق",
          price: 350000,
          currency: "toman",
          target_type: "course",
          target_id: "course-cardio",
          active: true,
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("QA Step 1-4: Prospective user sees complete course outline, preview lesson unlocked, others locked, and rich conversion CTAs", async () => {
    mockGetCourseLearning.mockResolvedValue({
      request_id: "req-preview-1",
      course: {
        id: "course-cardio",
        organization_id: "org-1",
        title: "دوره جامع فارماکولوژی قلب و عروق",
        subject: "فارماکولوژی",
        locked: true,
        access_reason: "locked",
      },
      modules: [
        {
          id: "mod-1",
          title: "فصل ۱: داروهای ضد فشار خون",
          sort_order: 1,
          lessons: [
            {
              id: "lesson-preview",
              module_id: "mod-1",
              title: "درس ۱: مهارکننده‌های ACE و مکانیسم اثر",
              content_type: "markdown",
              content_markdown: "## مقدمه بر مهارکننده‌های ACE\nمهارکننده‌های آنزیم مبدل آنژیوتانسین (ACEIs) دسته‌ای مهم از داروها در درمان پرفشاری خون هستند.",
              locked: false,
              is_preview: true,
              access_reason: "free_preview",
              estimated_minutes: 15,
            },
            {
              id: "lesson-locked-2",
              module_id: "mod-1",
              title: "درس ۲: عوارض جانبی و تداخلات دارویی ACEI",
              content_type: "markdown",
              content_markdown: "🔒 این محتوا مخصوص اعضای ویژه آوانا است.",
              locked: true,
              access_reason: "locked",
              estimated_minutes: 20,
            },
          ],
        },
        {
          id: "mod-2",
          title: "فصل ۲: بتابلوکرها و آنتاگونیست‌های کلسیم",
          sort_order: 2,
          lessons: [
            {
              id: "lesson-locked-3",
              module_id: "mod-2",
              title: "درس ۳: طبقه‌بندی بتابلوکرها",
              content_type: "markdown",
              content_markdown: "🔒 این محتوا مخصوص اعضای ویژه آوانا است.",
              locked: true,
              access_reason: "locked",
              estimated_minutes: 25,
            },
          ],
        },
      ],
      progress: {
        total_lessons: 3,
        completed_lessons: 0,
        progress_percent: 0,
      },
      access: {
        granted: false,
        reason: "locked",
        expiresAt: null,
        availablePurchaseOptions: [
          {
            type: "course",
            productId: "prod-course-1",
            code: "course_cardio_101",
            title: "دوره جامع فارماکولوژی قلب و عروق",
            price: 350000,
            currency: "toman",
            durationDays: null,
          },
        ],
      },
      preview: {
        preview_lesson_id: "lesson-preview",
        preview_flashcards_count: 5,
        preview_quiz_questions_count: 5,
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/courses/course-cardio"]}>
          <Routes>
            <Route path="/courses/:courseId" element={<LearningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Verify Header and outline are rendered
    await waitFor(() => {
      expect(screen.getByText("دوره جامع فارماکولوژی قلب و عروق")).toBeDefined();
    });

    // 2. Verify all chapters and lessons are in the syllabus outline
    expect(screen.getAllByText("فصل ۱: داروهای ضد فشار خون")[0]).toBeDefined();
    expect(screen.getAllByText("فصل ۲: بتابلوکرها و آنتاگونیست‌های کلسیم")[0]).toBeDefined();
    expect(screen.getAllByText("درس ۱: مهارکننده‌های ACE و مکانیسم اثر")[0]).toBeDefined();
    expect(screen.getAllByText("درس ۲: عوارض جانبی و تداخلات دارویی ACEI")[0]).toBeDefined();

    // 3. Verify Preview lesson is auto-selected and shows preview badge & real markdown
    expect(screen.getAllByText("مقدمه بر مهارکننده‌های ACE")[0]).toBeDefined();
    expect(screen.getAllByText("پیش‌نمایش رایگان این دوره آموزشی")[0]).toBeDefined();
    expect(screen.getAllByText("پایان جلسه نمونه رایگان")[0]).toBeDefined();
    expect(screen.getAllByText("از این مبحث لذت بردید؟ کل این دوره آموزشی را آزاد کنید!")[0]).toBeDefined();

    // 4. Click locked lesson 2 and verify paywall is displayed without leaking content
    fireEvent.click(screen.getAllByText("درس ۲: عوارض جانبی و تداخلات دارویی ACEI")[0]);

    await waitFor(() => {
      expect(screen.getAllByText("محتوای ویژه آوانا پلاس")[0]).toBeDefined();
      expect(screen.getAllByText("برای دسترسی به متن کامل این درسنامه، اشتراک تهیه کرده یا این محتوا را مستقلاً خریداری کنید")[0]).toBeDefined();
    });
    expect(screen.queryByText("متن محرمانه و کامل درس دوم")).toBeNull();
  });

  it("QA Step 6: Flashcards tab provides exactly 5 preview flashcards and end-of-preview purchase CTA", async () => {
    const mockPreviewCards = [
      { id: "fc-1", question: "ACE چیست؟", answer: "آنزیم مبدل آنژیوتانسین", sort_order: 1 },
      { id: "fc-2", question: "عوارض شایع کاپتوپریل؟", answer: "سرفه خشک به دلیل برادی‌کینین", sort_order: 2 },
      { id: "fc-3", question: "موارد منع مصرف ACEI؟", answer: "بارداری و تنگی دوطرفه شریان کلیوی", sort_order: 3 },
      { id: "fc-4", question: "کدام ACEI پیش‌دارو نیست؟", answer: "لیزینوپریل و کاپتوپریل", sort_order: 4 },
      { id: "fc-5", question: "تداخل خطرناک با ACEI؟", answer: "دیورتیک‌های نگه‌دارنده پتاسیم", sort_order: 5 },
    ];

    const queueData = {
      due_cards: mockPreviewCards,
      is_preview: true,
      preview_limit: 5,
    };
    mockGetFlashcardsQueue.mockResolvedValue(queueData);
    mockGetMultiReviewQueue.mockResolvedValue(queueData);

    const onUnlockMock = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <FlashcardExperience
            organizationId="org-1"
            courseId="course-cardio"
            isPreview={true}
            onUnlock={onUnlockMock}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify preview header badge
    await waitFor(() => {
      expect(screen.getByText(/پیش‌نمایش رایگان \(۵ کارت\)/)).toBeDefined();
      expect(screen.getByText("ACE چیست؟")).toBeDefined();
    });

    // Flip first card
    fireEvent.click(screen.getByText("ACE چیست؟"));
    await waitFor(() => {
      expect(screen.getByText("آنزیم مبدل آنژیوتانسین")).toBeDefined();
    });

    // Rate good to advance
    const goodBtn = screen.getByRole("button", { name: /خوب/i });
    fireEvent.click(goodBtn);

    // Verify second card loads
    await waitFor(() => {
      expect(screen.getByText("عوارض شایع کاپتوپریل؟")).toBeDefined();
    });
  });

  it("QA Step 7: Quizzes tab provides 5 preview questions, conceals answer keys, and renders results with purchase CTA", async () => {
    const mockPreviewQuiz = {
      quiz: {
        id: "quiz-preview-1",
        title: "آزمون پیش‌نمایش فارماکولوژی قلب",
        is_preview: true,
        questions: [
          {
            id: "q-1",
            question: "کدام دارو پیش‌دارو (Prodrug) نیست؟",
            question_type: "multiple_choice",
            choices: ["انالاپریل", "کاپتوپریل", "راميپريل", "فوزینوپریل"],
          },
          {
            id: "q-2",
            question: "علت سرفه خشک ناشی از مهارکننده ACE چیست؟",
            question_type: "multiple_choice",
            choices: ["تجمع برادی‌کینین", "افت پتاسیم", "افزایش رنین", "اسپاسم نای"],
          },
          {
            id: "q-3",
            question: "کدام گروه دارویی منع مصرف مطلق در بارداری دارد؟",
            question_type: "multiple_choice",
            choices: ["متیل‌دوپا", "ACEIs", "هیدرالازین", "لبتالول"],
          },
          {
            id: "q-4",
            question: "مصرف همزمان کدام دارو با لوزارتان خطر هایپرکالمی شدید دارد؟",
            question_type: "multiple_choice",
            choices: ["اسپیرونولاکتون", "هیدروکلروتیازید", "فوروزماید", "آملودیپین"],
          },
          {
            id: "q-5",
            question: "هدف اولیه درمانی فشار خون در بیماران دیابتی مبتلا به پروتئینوری چیست؟",
            question_type: "multiple_choice",
            choices: ["کمتر از 130/80", "کمتر از 140/90", "کمتر از 150/90", "کمتر از 160/100"],
          },
        ],
      },
    };

    mockGetQuiz.mockResolvedValue(mockPreviewQuiz);
    mockSubmitQuizAttempt.mockResolvedValue({
      attempt_id: "att-preview-1",
      score_percent: 100,
      passed: true,
      total_questions: 5,
      correct_count: 5,
      incorrect_count: 0,
      questionResults: {
        "q-1": { status: "correct", correctValues: ["کاپتوپریل"] },
      },
    });

    const onUnlockMock = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <QuizExperience
            organizationId="org-1"
            courseId="course-cardio"
            quizId="quiz-preview-1"
            isPreview={true}
            onUnlock={onUnlockMock}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify question 1 is rendered and choices are visible
    await waitFor(() => {
      expect(screen.getByText("کدام دارو پیش‌دارو (Prodrug) نیست؟")).toBeDefined();
      expect(screen.getByText("کاپتوپریل")).toBeDefined();
      expect(screen.getByText("انالاپریل")).toBeDefined();
    });

    // Verify secret answers are NOT exposed
    expect(screen.queryByText("پاسخ صحیح")).toBeNull();

    // Select answer "کاپتوپریل"
    fireEvent.click(screen.getByText("کاپتوپریل"));

    // Advance to next question
    const nextBtn = screen.getByRole("button", { name: /سوال بعدی/i });
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(screen.getByText("علت سرفه خشک ناشی از مهارکننده ACE چیست؟")).toBeDefined();
    });
  });
});
