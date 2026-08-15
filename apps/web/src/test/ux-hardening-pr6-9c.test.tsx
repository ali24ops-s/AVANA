/**
 * PR6-9C: Student Experience Hardening Test Suite
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "../providers/AuthProvider.js";
import { LearningPage } from "../pages/LearningPage.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { QuizExperience } from "../components/quiz/QuizExperience.js";
import type {
  CourseLearnResponse,
  FlashcardResource,
  QuizResponse,
} from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("PR6-9C UX Hardening: Lessons", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseId = "00000000-0000-0000-0000-000000000002";
  const lessonId1 = "00000000-0000-0000-0000-000000000003";
  const lessonId2 = "00000000-0000-0000-0000-000000000004";

  const mockEmptyCurriculum: CourseLearnResponse = {
    request_id: "req-curriculum-empty",
    course: {
      id: courseId,
      title: "Introduction to Pediatrics",
      subject: "Pediatrics",
      exam_at: null,
    },
    modules: [],
    progress: {
      total_lessons: 0,
      completed_lessons: 0,
      progress_percent: 0,
    },
  };

  const mockTwoLessonsCurriculum: CourseLearnResponse = {
    request_id: "req-curriculum-2",
    course: {
      id: courseId,
      title: "Human Anatomy",
      subject: "Anatomy",
      exam_at: null,
    },
    modules: [
      {
        id: "mod-1",
        title: "Skeletal System",
        description: "Bones and joints",
        sort_order: 0,
        lessons: [
          {
            id: lessonId1,
            module_id: "mod-1",
            title: "The Femur Bone Structure",
            content_type: "markdown",
            content_markdown: "The femur is the longest bone in the body.",
            sort_order: 0,
            estimated_minutes: 5,
            completed: false,
            completed_at: null,
          },
          {
            id: lessonId2,
            module_id: "mod-1",
            title: "Skull and Cranial Bones",
            content_type: "markdown",
            content_markdown: "The skull consists of 22 bones.",
            sort_order: 1,
            estimated_minutes: 8,
            completed: false,
            completed_at: null,
          },
        ],
      },
    ],
    progress: {
      total_lessons: 2,
      completed_lessons: 0,
      progress_percent: 0,
    },
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a clear empty state when curriculum contains 0 published lessons", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockEmptyCurriculum)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "Academy", slug: "acad" }],
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("هنوز درسی در دسترس نیست")).toBeDefined();
    });
  });

  it("supports previous/next lesson buttons to navigate between lessons", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockTwoLessonsCurriculum)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "Academy", slug: "acad" }],
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Initial first lesson displayed
    await waitFor(() => {
      expect(screen.getByText(/the femur is the longest bone/i)).toBeDefined();
    });

    // Next button should be present
    const nextBtn = screen.getByRole("button", { name: /درس بعدی/i });
    fireEvent.click(nextBtn);

    // Second lesson displayed
    await waitFor(() => {
      expect(screen.getByText(/the skull consists of 22 bones/i)).toBeDefined();
    });

    // Previous button should be present
    const prevBtn = screen.getByRole("button", { name: /درس قبلی/i });
    fireEvent.click(prevBtn);

    // Back to first lesson
    await waitFor(() => {
      expect(screen.getByText(/the femur is the longest bone/i)).toBeDefined();
    });
  });

  it("renders a failure recovery alert if lesson completion save fails on backend", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes("/progress") && opts?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal Database Error"),
        } as unknown as Response);
      }
      if (urlStr.includes("/learn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockTwoLessonsCurriculum)),
        } as unknown as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-orgs",
                items: [{ id: orgId, name: "Academy", slug: "acad" }],
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/courses/${courseId}`]}>
          <AuthProvider>
            <Routes>
              <Route path="/courses/:courseId" element={<LearningPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/the femur is the longest bone/i)).toBeDefined();
    });

    const markCompleteBtn = screen.getByRole("button", { name: /ثبت به عنوان خوانده‌شده/i });
    fireEvent.click(markCompleteBtn);

    // Fail banner should render
    await waitFor(() => {
      expect(screen.getByText(/خطا در ثبت وضعیت تکمیل/i)).toBeDefined();
    });
  });
});

describe("PR6-9C UX Hardening: Flashcards", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseId = "00000000-0000-0000-0000-000000000002";

  const mockFlashcards: FlashcardResource[] = [
    {
      id: "fc-1",
      organization_id: orgId,
      course_id: courseId,
      document_id: "doc-1",
      generated_content_id: null,
      card_type: "concept",
      difficulty: "medium",
      question: "Which organ produces insulin?",
      answer: "Pancreas",
      explanation: "Beta cells in islets of Langerhans.",
      interval_days: 2,
      ease_factor: 2.5,
      due_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: "fc-2",
      organization_id: orgId,
      course_id: courseId,
      document_id: "doc-1",
      generated_content_id: null,
      card_type: "concept",
      difficulty: "medium",
      question: "What is the main function of red blood cells?",
      answer: "Oxygen transport",
      explanation: "Hemoglobin binds oxygen molecules.",
      interval_days: 3,
      ease_factor: 2.6,
      due_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("disables keys and shows rating spinners on submit, delaying card change until success", async () => {
    const queryClient = createTestQueryClient();
    let resolveMutation: (val: unknown) => void = () => {};
    const mutationPromise = new Promise((resolve) => {
      resolveMutation = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes("/review") && opts?.method === "POST") {
        return mutationPromise.then(() => ({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify({ success: true })),
        })) as unknown as Promise<Response>;
      }
      if (urlStr.includes("flashcards/review-queue") || urlStr.includes("flashcards")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                due_cards: mockFlashcards,
                flashcards: mockFlashcards,
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience organizationId={orgId} courseId={courseId} />
      </QueryClientProvider>,
    );

    // Initial card shown
    await waitFor(() => {
      expect(screen.getByText("Which organ produces insulin?")).toBeDefined();
    });

    // Flip card
    const cardElement = screen.getByRole("button", { name: /سوال فلش‌کارت/i });
    fireEvent.click(cardElement);

    await waitFor(() => {
      expect(screen.getByText("Pancreas")).toBeDefined();
    });

    // Select rating: Good
    const goodBtn = screen.getByRole("button", { name: /خوب/i });
    fireEvent.click(goodBtn);

    // The rating buttons should now be disabled during mutation progress
    expect(goodBtn.getAttribute("disabled")).toBe("");

    // Resolve the mutation
    resolveMutation(null);

    // Wait until transition to next card completes
    await waitFor(() => {
      expect(screen.getByText("What is the main function of red blood cells?")).toBeDefined();
    });
  });

  it("shows error recovery warning banner if rating submission fails", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes("/review") && opts?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Database offline"),
        } as unknown as Response);
      }
      if (urlStr.includes("flashcards/review-queue") || urlStr.includes("flashcards")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                due_cards: mockFlashcards,
                flashcards: mockFlashcards,
              }),
            ),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FlashcardExperience organizationId={orgId} courseId={courseId} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Which organ produces insulin?")).toBeDefined();
    });

    // Flip card
    const cardElement = screen.getByRole("button", { name: /سوال فلش‌کارت/i });
    fireEvent.click(cardElement);

    await waitFor(() => {
      expect(screen.getByText("Pancreas")).toBeDefined();
    });

    // Click rating "Good"
    const goodBtn = screen.getByRole("button", { name: /خوب/i });
    fireEvent.click(goodBtn);

    // Failure banner should display
    await waitFor(() => {
      expect(screen.getByText(/خطا در ثبت بازخورد/i)).toBeDefined();
    });

    // Card should not advance (index stays 0)
    expect(screen.getByText("Which organ produces insulin?")).toBeDefined();
  });
});

describe("PR6-9C UX Hardening: Quizzes", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseId = "00000000-0000-0000-0000-000000000002";
  const quizId = "00000000-0000-0000-0000-000000000003";

  const mockQuizDetail: QuizResponse = {
    request_id: "req-quiz-det",
    quiz: {
      id: quizId,
      organization_id: orgId,
      course_id: courseId,
      document_id: "doc-1",
      title: "Cell Biology Test",
      status: "published",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      questions: [
        {
          id: "q-1",
          quiz_id: quizId,
          generated_content_id: null,
          question: "Which organelle generates ATP?",
          question_type: "multiple_choice",
          choices: ["Nucleus", "Mitochondria", "Ribosome", "Lysosome"],
          correct_answer: "Mitochondria",
          explanation: "Mitochondria produce ATP through cell respiration.",
          sort_order: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    },
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a recovery banner if quiz attempt submission fails", async () => {
    const queryClient = createTestQueryClient();

    vi.spyOn(globalThis, "fetch").mockImplementation((url, opts) => {
      const urlStr = String(url);
      if (urlStr.includes("/attempts") && opts?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Internal failure"),
        } as unknown as Response);
      }
      if (urlStr.includes(`/quizzes/${quizId}`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(mockQuizDetail)),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({})),
      } as unknown as Response);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <QuizExperience organizationId={orgId} courseId={courseId} quizId={quizId} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Which organelle generates ATP?")).toBeDefined();
    });

    // Select choice
    const choiceBtn = screen.getByRole("button", { name: /mitochondria/i });
    fireEvent.click(choiceBtn);

    // Submit attempt
    const submitBtn = screen.getByRole("button", { name: /ثبت و پایان آزمون/i });
    fireEvent.click(submitBtn);

    // Recovery banner should render
    await waitFor(() => {
      expect(screen.getByText(/خطا در ثبت نتیجه آزمون/i)).toBeDefined();
    });
  });
});
