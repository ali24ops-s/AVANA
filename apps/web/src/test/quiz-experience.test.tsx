import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QuizListView } from "../components/quiz/QuizListView.js";
import { QuizExperience } from "../components/quiz/QuizExperience.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Quiz Experience and Filter UX Flow", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";
  const mockQuizId = "00000000-0000-0000-0000-000000000003";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("1. renders quiz list with published quizzes and filter bar above chapter cards", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-ql",
        quizzes: [
          {
            id: mockQuizId,
            organization_id: mockOrgId,
            course_id: mockCourseId,
            document_id: "doc-1",
            title: "Cardiovascular Pharmacology Quiz",
            status: "published",
            questions: [
              { id: "q-1", question: "ACE" },
              { id: "q-2", question: "Beta" },
            ],
          },
        ],
      }),
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Cardiovascular Pharmacology Quiz")).toBeDefined();
      expect(screen.getByTestId("quiz-filter-bar")).toBeDefined();
      expect(screen.getByRole("group", { name: "انتخاب تعداد سؤالات" })).toBeDefined();
      expect(screen.getByRole("group", { name: "انتخاب سطح دشواری" })).toBeDefined();
      expect(screen.getByRole("button", { name: "۱۰ سؤال" })).toBeDefined();
      expect(screen.getByRole("button", { name: "آسان" })).toBeDefined();

      // Verify that date, published badge, and question mark icon are NOT rendered
      expect(screen.queryByText(/تاریخ:/)).toBeNull();
      expect(screen.queryByText(/Invalid Date/)).toBeNull();
      expect(screen.queryByText("منتشر شده")).toBeNull();

      // Verify essential info: question count and enter quiz button
      expect(screen.getByText("۲ سوال")).toBeDefined();
      expect(screen.getByText("شروع آزمون")).toBeDefined();
    });
  });

  it("2. filter controls DO NOT render inside QuizExperience", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-qdet",
        quiz: {
          id: mockQuizId,
          organization_id: mockOrgId,
          course_id: mockCourseId,
          title: "Cardiovascular Pharmacology Quiz",
          status: "published",
          questions: [
            {
              id: "q-1",
              quiz_id: mockQuizId,
              question: "What is the primary effect of ACE inhibitors?",
              question_type: "mcq",
              choices: ["Choice A", "Choice B"],
              correct_answer: "Choice A",
              difficulty: "easy",
              sort_order: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        },
      }),
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
          quizId={mockQuizId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("What is the primary effect of ACE inhibitors?")).toBeDefined();
    });

    // Verify filter controls are NOT in QuizExperience
    expect(screen.queryByTestId("quiz-filter-bar")).toBeNull();
    expect(screen.queryByRole("group", { name: "انتخاب تعداد سؤالات" })).toBeNull();
    expect(screen.queryByRole("group", { name: "انتخاب سطح دشواری" })).toBeNull();
  });

  it("3. selecting 10 questions and easy difficulty on QuizListView applies to the exam when opening a chapter", async () => {
    const mockQuestions = [
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `q-easy-${i + 1}`,
        quiz_id: mockQuizId,
        question: `Easy Question ${i + 1}`,
        question_type: "mcq",
        choices: ["Choice A", "Choice B"],
        correct_answer: "Choice A",
        difficulty: "easy",
        sort_order: i,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `q-hard-${i + 1}`,
        quiz_id: mockQuizId,
        question: `Hard Question ${i + 1}`,
        question_type: "mcq",
        choices: ["Choice A", "Choice B"],
        correct_answer: "Choice A",
        difficulty: "hard",
        sort_order: i + 15,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    ];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/quizzes/${mockQuizId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-qdet",
            quiz: {
              id: mockQuizId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Cardiovascular Pharmacology Quiz",
              status: "published",
              questions: mockQuestions,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-ql",
          quizzes: [
            {
              id: mockQuizId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Cardiovascular Pharmacology Quiz",
              status: "published",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Filter controls are present on list view
    await waitFor(() => {
      expect(screen.getByText("Cardiovascular Pharmacology Quiz")).toBeDefined();
    });

    // Select "۱۰ سؤال" and "آسان"
    fireEvent.click(screen.getByRole("button", { name: "۱۰ سؤال" }));
    fireEvent.click(screen.getByRole("button", { name: "آسان" }));

    // Click to start quiz
    fireEvent.click(screen.getByLabelText("شرکت در آزمون: Cardiovascular Pharmacology Quiz"));

    // Verify QuizExperience is entered with filters pre-applied: 10 questions, easy only
    await waitFor(() => {
      expect(screen.getByText("Easy Question 1")).toBeDefined();
      expect(screen.getByText("سوال ۱ از ۱۰")).toBeDefined();
      expect(screen.getByText("(۱۰ سؤال منتخب)")).toBeDefined();
    });

    // Verify filter controls are NOT displayed inside the quiz
    expect(screen.queryByTestId("quiz-filter-bar")).toBeNull();
  });

  it("4 & 5. returning to QuizListView preserves filters, and another chapter receives the same filters", async () => {
    const mockQuiz1Id = "quiz-1";
    const mockQuiz2Id = "quiz-2";

    const quiz1Questions = Array.from({ length: 20 }, (_, i) => ({
      id: `q1-${i + 1}`,
      quiz_id: mockQuiz1Id,
      question: `Ch1 Question ${i + 1}`,
      question_type: "mcq",
      choices: ["A", "B"],
      difficulty: "easy",
      sort_order: i,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const quiz2Questions = Array.from({ length: 20 }, (_, i) => ({
      id: `q2-${i + 1}`,
      quiz_id: mockQuiz2Id,
      question: `Ch2 Question ${i + 1}`,
      question_type: "mcq",
      choices: ["A", "B"],
      difficulty: "easy",
      sort_order: i,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/quizzes/${mockQuiz1Id}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "q1",
            quiz: {
              id: mockQuiz1Id,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Chapter 1 Quiz",
              status: "published",
              questions: quiz1Questions,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }
      if (url.includes(`/quizzes/${mockQuiz2Id}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "q2",
            quiz: {
              id: mockQuiz2Id,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Chapter 2 Quiz",
              status: "published",
              questions: quiz2Questions,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "list",
          quizzes: [
            {
              id: mockQuiz1Id,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Chapter 1 Quiz",
              status: "published",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: mockQuiz2Id,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Chapter 2 Quiz",
              status: "published",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Wait for quizzes to load
    await waitFor(() => {
      expect(screen.getByText("Chapter 1 Quiz")).toBeDefined();
    });

    // Select 10 questions in filter bar
    fireEvent.click(screen.getByRole("button", { name: "۱۰ سؤال" }));

    // Enter Chapter 1
    fireEvent.click(screen.getByLabelText("شرکت در آزمون: Chapter 1 Quiz"));

    await waitFor(() => {
      expect(screen.getByText("Ch1 Question 1")).toBeDefined();
      expect(screen.getByText("سوال ۱ از ۱۰")).toBeDefined();
    });

    // Exit back to QuizListView
    fireEvent.click(screen.getByText("خروج از آزمون"));

    // Verify returning to QuizListView preserves the filter
    await waitFor(() => {
      expect(screen.getByText("Chapter 1 Quiz")).toBeDefined();
      expect(screen.getByText("Chapter 2 Quiz")).toBeDefined();
    });
    const btn10 = screen.getByRole("button", { name: "۱۰ سؤال" });
    expect(btn10.getAttribute("aria-pressed")).toBe("true");

    // Enter Chapter 2 -> Chapter 2 ALSO receives the 10 questions filter!
    fireEvent.click(screen.getByLabelText("شرکت در آزمون: Chapter 2 Quiz"));

    await waitFor(() => {
      expect(screen.getByText("Ch2 Question 1")).toBeDefined();
      expect(screen.getByText("سوال ۱ از ۱۰")).toBeDefined();
    });
  });

  it("6. filters are applied before question 1 renders (no flash of unfiltered questions)", async () => {
    const mockQuestions = [
      {
        id: "q-hard-1",
        quiz_id: mockQuizId,
        question: "Hard Question First",
        question_type: "mcq",
        choices: ["A", "B"],
        difficulty: "hard",
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "q-easy-1",
        quiz_id: mockQuizId,
        question: "Easy Question Second",
        question_type: "mcq",
        choices: ["A", "B"],
        difficulty: "easy",
        sort_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-qdet",
        quiz: {
          id: mockQuizId,
          organization_id: mockOrgId,
          course_id: mockCourseId,
          title: "Flash Test Quiz",
          status: "published",
          questions: mockQuestions,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
          quizId={mockQuizId}
          initialDifficulty="easy"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // The very first rendered question should be Easy Question Second, never Hard Question First
      expect(screen.getByText("Easy Question Second")).toBeDefined();
      expect(screen.queryByText("Hard Question First")).toBeNull();
      expect(screen.getByText("سوال ۱ از ۱")).toBeDefined();
    });
  });

  it("7. submitting filtered quiz sends accurate questionIds and scores correctly", async () => {
    let capturedBody: unknown = null;

    global.fetch = vi.fn().mockImplementation((_url: string, opts?: { method?: string; body?: string }) => {
      if (opts?.method === "POST") {
        if (opts.body) {
          capturedBody = JSON.parse(opts.body);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-att",
            attempt: {
              attemptId: "att-filtered-1",
              quizId: mockQuizId,
              score: 100,
              correct: 1,
              total: 1,
              answers: { "q-1": "Correct A" },
              completedAt: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-qdet",
          quiz: {
            id: mockQuizId,
            organization_id: mockOrgId,
            course_id: mockCourseId,
            title: "Filtered Submit Quiz",
            status: "published",
            questions: [
              {
                id: "q-1",
                quiz_id: mockQuizId,
                question: "Easy Q1",
                question_type: "mcq",
                choices: ["Correct A", "Wrong B"],
                correct_answer: "Correct A",
                difficulty: "easy",
                sort_order: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                id: "q-2",
                quiz_id: mockQuizId,
                question: "Hard Q2",
                question_type: "mcq",
                choices: ["Choice C", "Choice D"],
                correct_answer: "Choice C",
                difficulty: "hard",
                sort_order: 1,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          },
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
          quizId={mockQuizId}
          initialDifficulty="easy"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Easy Q1")).toBeDefined();
      expect(screen.getByText("سوال ۱ از ۱")).toBeDefined();
    });

    // Select answer
    fireEvent.click(screen.getByText("Correct A"));

    // Submit
    fireEvent.click(screen.getByText("ثبت و پایان آزمون"));

    await waitFor(() => {
      expect(screen.getByText("آزمون با موفقیت گذرانده شد!")).toBeDefined();
    });

    // Verify submitted payload sent both answers and questionIds scoped only to q-1
    expect(capturedBody).toEqual({
      answers: [{ questionId: "q-1", answer: "Correct A" }],
      questionIds: ["q-1"],
    });
  });

  it("8. switching chapters isolates state and answers without leakage", async () => {
    const mockQuiz1Id = "quiz-ch1";
    const mockQuiz2Id = "quiz-ch2";

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/quizzes/${mockQuiz1Id}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "q1",
            quiz: {
              id: mockQuiz1Id,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Chapter 1",
              status: "published",
              questions: [
                {
                  id: "q-ch1-1",
                  quiz_id: mockQuiz1Id,
                  question: "Question for Chapter 1",
                  question_type: "mcq",
                  choices: ["Choice 1A", "Choice 1B"],
                  correct_answer: "Choice 1A",
                  difficulty: "medium",
                  sort_order: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            },
          }),
        });
      }
      if (url.includes(`/quizzes/${mockQuiz2Id}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "q2",
            quiz: {
              id: mockQuiz2Id,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Chapter 2",
              status: "published",
              questions: [
                {
                  id: "q-ch2-1",
                  quiz_id: mockQuiz2Id,
                  question: "Question for Chapter 2",
                  question_type: "mcq",
                  choices: ["Choice 2A", "Choice 2B"],
                  correct_answer: "Choice 2A",
                  difficulty: "medium",
                  sort_order: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "list",
          quizzes: [
            {
              id: mockQuiz1Id,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Chapter 1",
              status: "published",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            {
              id: mockQuiz2Id,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Chapter 2",
              status: "published",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Open Chapter 1
    await waitFor(() => {
      expect(screen.getByText("Chapter 1")).toBeDefined();
    });
    fireEvent.click(screen.getByLabelText("شرکت در آزمون: Chapter 1"));

    // Select Choice 1A
    await waitFor(() => {
      expect(screen.getByText("Question for Chapter 1")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Choice 1A"));
    const choice1AButton = screen.getByRole("button", { name: /Choice 1A/ });
    expect(choice1AButton.getAttribute("aria-pressed")).toBe("true");

    // Exit to list
    fireEvent.click(screen.getByText("خروج از آزمون"));

    // Open Chapter 2
    await waitFor(() => {
      expect(screen.getByText("Chapter 2")).toBeDefined();
    });
    fireEvent.click(screen.getByLabelText("شرکت در آزمون: Chapter 2"));

    // In Chapter 2, no choices are selected
    await waitFor(() => {
      expect(screen.getByText("Question for Chapter 2")).toBeDefined();
    });
    const choice2AButton = screen.getByRole("button", { name: /Choice 2A/ });
    const choice2BButton = screen.getByRole("button", { name: /Choice 2B/ });
    expect(choice2AButton.getAttribute("aria-pressed")).toBe("false");
    expect(choice2BButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("9. displays Persian empty state when no questions match the selected filter and allows resetting", async () => {
    const mockQuestions = [
      {
        id: "q-e1",
        quiz_id: mockQuizId,
        question: "Only Easy Question",
        question_type: "mcq",
        choices: ["A", "B"],
        difficulty: "easy",
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-empty-filter",
        quiz: {
          id: mockQuizId,
          organization_id: mockOrgId,
          course_id: mockCourseId,
          title: "Chapter with Easy Only",
          status: "published",
          questions: mockQuestions,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
          quizId={mockQuizId}
          initialDifficulty="hard"
        />
      </QueryClientProvider>,
    );

    // Verify empty state is displayed because chapter has only easy questions
    await waitFor(() => {
      expect(screen.getByText("سؤالی با فیلترهای انتخابی یافت نشد")).toBeDefined();
      expect(screen.getByText("نمایش تمام سؤالات این فصل")).toBeDefined();
    });

    // Click "نمایش تمام سؤالات این فصل" to clear filters locally and take the quiz
    fireEvent.click(screen.getByText("نمایش تمام سؤالات این فصل"));

    await waitFor(() => {
      expect(screen.getByText("Only Easy Question")).toBeDefined();
      expect(screen.getByText("سوال ۱ از ۱")).toBeDefined();
    });
  });

  it("10. resets active quiz and filters when courseId changes to prevent cross-course leakage", async () => {
    const course1Id = "course-1";
    const course2Id = "course-2";

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(course1Id)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "c1",
            quizzes: [
              {
                id: "q-c1",
                organization_id: mockOrgId,
                course_id: course1Id,
                title: "Course 1 Quiz",
                status: "published",
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
          request_id: "c2",
          quizzes: [
            {
              id: "q-c2",
              organization_id: mockOrgId,
              course_id: course2Id,
              title: "Course 2 Quiz",
              status: "published",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={course1Id}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Course 1 Quiz")).toBeDefined();
    });

    // Select filter in Course 1
    const btn10 = screen.getByRole("button", { name: "۱۰ سؤال" });
    fireEvent.click(btn10);
    expect(btn10.getAttribute("aria-pressed")).toBe("true");

    // Change courseId to Course 2
    rerender(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={course2Id}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Course 2 Quiz")).toBeDefined();
    });

    // Filters must be reset in Course 2 (no cross-course contamination)
    const btn10InC2 = screen.getByRole("button", { name: "۱۰ سؤال" });
    expect(btn10InC2.getAttribute("aria-pressed")).toBe("false");
    const btnAllInC2 = screen.getByRole("button", { name: "همه سؤالات" });
    expect(btnAllInC2.getAttribute("aria-pressed")).toBe("true");
  });

  it("11. showing all questions from empty state in QuizExperience does not alter saved filters on QuizListView", async () => {
    const mockEmptyQuizId = "quiz-empty";
    const mockQuestions = [
      {
        id: "q-e1",
        quiz_id: mockEmptyQuizId,
        question: "Easy Only Question",
        question_type: "mcq",
        choices: ["A", "B"],
        difficulty: "easy",
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/quizzes/${mockEmptyQuizId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "qdet",
            quiz: {
              id: mockEmptyQuizId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Empty Chapter Quiz",
              status: "published",
              questions: mockQuestions,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "list",
          quizzes: [
            {
              id: mockEmptyQuizId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "Empty Chapter Quiz",
              status: "published",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Empty Chapter Quiz")).toBeDefined();
    });

    // Select "دشوار" (which has 0 questions)
    fireEvent.click(screen.getByRole("button", { name: "دشوار" }));

    // Enter chapter
    fireEvent.click(screen.getByLabelText("شرکت در آزمون: Empty Chapter Quiz"));

    // Empty state appears
    await waitFor(() => {
      expect(screen.getByText("سؤالی با فیلترهای انتخابی یافت نشد")).toBeDefined();
    });

    // Click "نمایش تمام سؤالات این فصل" to bypass filter locally for this exam session
    fireEvent.click(screen.getByText("نمایش تمام سؤالات این فصل"));

    await waitFor(() => {
      expect(screen.getByText("Easy Only Question")).toBeDefined();
    });

    // Exit back to QuizListView
    fireEvent.click(screen.getByText("خروج از آزمون"));

    // Verify QuizListView STILL has "دشوار" selected!
    await waitFor(() => {
      expect(screen.getByText("Empty Chapter Quiz")).toBeDefined();
    });
    const btnHard = screen.getByRole("button", { name: "دشوار" });
    expect(btnHard.getAttribute("aria-pressed")).toBe("true");
  });

  it("12. gracefully handles chapters with fewer questions than requested count", async () => {
    // 10 questions total (5 easy + 5 hard), but user requests 20 questions of easy difficulty
    const mockQuestions = [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `q-few-${i + 1}`,
        quiz_id: mockQuizId,
        question: `Few Question ${i + 1}`,
        question_type: "mcq",
        choices: ["A", "B"],
        difficulty: "easy",
        sort_order: i,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `q-hard-${i + 1}`,
        quiz_id: mockQuizId,
        question: `Hard Question ${i + 1}`,
        question_type: "mcq",
        choices: ["A", "B"],
        difficulty: "hard",
        sort_order: i + 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "few",
        quiz: {
          id: mockQuizId,
          organization_id: mockOrgId,
          course_id: mockCourseId,
          title: "Few Questions Quiz",
          status: "published",
          questions: mockQuestions,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizExperience
          organizationId={mockOrgId}
          courseId={mockCourseId}
          quizId={mockQuizId}
          initialCount={20}
          initialDifficulty="easy"
        />
      </QueryClientProvider>,
    );

    // Should gracefully display all 5 available questions and correct counter "سوال ۱ از ۵"
    await waitFor(() => {
      expect(screen.getByText("Few Question 1")).toBeDefined();
      expect(screen.getByText("سوال ۱ از ۵")).toBeDefined();
      expect(screen.getByText("(۵ سؤال منتخب)")).toBeDefined();
    });
  });

  it("13. strips static 'آزمون ارزیابی آموخته‌ها:' prefix in both QuizListView and QuizExperience", async () => {
    const rawTitle = "آزمون ارزیابی آموخته‌ها: فارماکولوژی دستگاه قلبی و عروقی";
    const expectedCleanTitle = "فارماکولوژی دستگاه قلبی و عروقی";

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/quizzes/${mockQuizId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "qdet-clean",
            quiz: {
              id: mockQuizId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: rawTitle,
              status: "published",
              questions: [
                {
                  id: "q-1",
                  quiz_id: mockQuizId,
                  question: "Question 1",
                  question_type: "mcq",
                  choices: ["A", "B"],
                  correct_answer: "A",
                  difficulty: "easy",
                  sort_order: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "ql-clean",
          quizzes: [
            {
              id: mockQuizId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: rawTitle,
              status: "published",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <QuizListView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // In QuizListView: clean title should be shown, and the static prefix must NOT be visible
    await waitFor(() => {
      expect(screen.getByText(expectedCleanTitle)).toBeDefined();
      expect(screen.queryByText(rawTitle)).toBeNull();
      expect(screen.queryByText(/آزمون ارزیابی آموخته‌ها:/)).toBeNull();
    });

    // Click into chapter
    fireEvent.click(screen.getByLabelText(`شرکت در آزمون: ${expectedCleanTitle}`));

    // In QuizExperience: header should also show the clean chapter title
    await waitFor(() => {
      expect(screen.getByText(expectedCleanTitle)).toBeDefined();
      expect(screen.queryByText(rawTitle)).toBeNull();
      expect(screen.queryByText(/آزمون ارزیابی آموخته‌ها:/)).toBeNull();
    });
  });
});
