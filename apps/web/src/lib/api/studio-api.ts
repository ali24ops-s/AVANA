import type { ApiClient } from "./client.js";

export type MarketingQuizStatus = "draft" | "published" | "disabled";

export interface MarketingQuizChoice {
  id: string;
  text: string;
}

export interface NormalizedCorrectAnswer {
  choiceId: string | null;
  choiceIds?: string[];
  booleanAnswer?: boolean;
  ambiguous?: boolean;
  raw?: unknown;
}

export interface MarketingQuizQuestionSnapshot {
  id: string;
  marketingQuizId: string;
  sourceQuestionId?: string | null;
  sourceBankQuestionId?: string | null;
  question: string;
  choices: MarketingQuizChoice[];
  correctAnswer: NormalizedCorrectAnswer | { choiceId: string } | string;
  explanation?: string | null;
  difficulty: "easy" | "medium" | "hard";
  topic?: string | null;
  questionType: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingQuiz {
  id: string;
  organizationId?: string | null;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status: MarketingQuizStatus;
  settings: {
    ctaTitle?: string;
    ctaDescription?: string;
    ctaButtonText?: string;
    ctaUrl?: string;
    passScorePercentage?: number;
    [key: string]: unknown;
  };
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  questions?: MarketingQuizQuestionSnapshot[];
  questionsCount?: number;
  attemptsCount?: number;
}

export type QuestionSourceType = "course" | "bank" | "studio_quiz";

export interface UnifiedQuestionBankItem {
  id: string;
  sourceType: QuestionSourceType;
  sourceId: string;
  sourceCourseId?: string | null;
  sourceCourseTitle?: string | null;
  sourceModuleId?: string | null;
  sourceModuleTitle?: string | null;
  sourceLessonId?: string | null;
  sourceLessonTitle?: string | null;
  sourceQuizTitle?: string | null;
  question: string;
  choices: MarketingQuizChoice[];
  correctAnswer: NormalizedCorrectAnswer | { choiceId: string } | string;
  explanation?: string | null;
  difficulty: "easy" | "medium" | "hard";
  topic?: string | null;
  questionType: string;
  createdAt: string;
}

export interface QuestionBankSourcesResponse {
  courses: Array<{
    id: string;
    title: string;
    modules: Array<{
      id: string;
      title: string;
      lessons: Array<{
        id: string;
        title: string;
      }>;
    }>;
  }>;
  questionTypes: Array<{ id: string; label: string }>;
  topics: string[];
}

export interface SearchQuestionBankFilters {
  [key: string]: unknown;
  organizationId?: string;
  search?: string;
  sourceType?: "all" | QuestionSourceType;
  courseId?: string;
  moduleId?: string;
  lessonId?: string;
  difficulty?: "all" | "easy" | "medium" | "hard";
  questionType?: string;
  limit?: number;
  offset?: number;
  excludeQuizId?: string;
}

export interface BatchAddQuestionItemInput {
  sourceType: QuestionSourceType | "manual";
  sourceId?: string;
  question?: string;
  choices?: MarketingQuizChoice[];
  correctAnswer?: { choiceId: string } | string;
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
  topic?: string;
  questionType?: string;
}

export interface MarketingQuestionBankItem {
  id: string;
  organizationId?: string | null;
  sourceType: "course" | "manual" | "ai";
  sourceQuestionId?: string | null;
  sourceCourseId?: string | null;
  question: string;
  choices: MarketingQuizChoice[];
  correctAnswer: { choiceId: string } | string;
  explanation?: string | null;
  difficulty: "easy" | "medium" | "hard";
  topic?: string | null;
  questionType: string;
  tags: string[];
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuizAnalyticsSummary {
  quizId: string;
  quizTitle: string;
  totalAttempts: number;
  averageScore: number;
  scoreDistribution: {
    range0To20: number;
    range21To40: number;
    range41To60: number;
    range61To80: number;
    range81To100: number;
  };
  participationTimeline: Array<{
    date: string;
    attempts: number;
  }>;
}

export interface PublicQuizPayload {
  id?: string;
  isPreview?: boolean;
  canViewAnswerKey?: boolean;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  settings: {
    ctaTitle?: string;
    ctaDescription?: string;
    ctaButtonText?: string;
    ctaUrl?: string;
    passScorePercentage?: number;
  };
  questions: Array<{
    id: string;
    question: string;
    choices: MarketingQuizChoice[];
    difficulty: "easy" | "medium" | "hard";
    topic?: string | null;
    questionType?: string;
    sortOrder: number;
    correctAnswer?: unknown;
    explanation?: string | null;
  }>;
}

export interface PublicAttemptReviewQuestion {
  id: string;
  question: string;
  choices: MarketingQuizChoice[];
  userAnswer?: string | null;
  isCorrect: boolean;
}

export interface PublicAttemptResult {
  attemptToken: string;
  quizTitle: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  completedAt: string;
  settings?: Record<string, unknown>;
  questionReviews?: PublicAttemptReviewQuestion[];
}

export interface PublicAttemptSolutionQuestion {
  id: string;
  question: string;
  choices: MarketingQuizChoice[];
  difficulty: "easy" | "medium" | "hard";
  topic?: string | null;
  questionType?: string;
  sortOrder: number;
  userAnswer?: string | null;
  isCorrect: boolean;
  correctAnswer: unknown;
  explanation?: string | null;
}

export interface PublicAttemptSolutionsResult {
  attemptToken: string;
  quizTitle: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  completedAt: string;
  questions: PublicAttemptSolutionQuestion[];
}

export interface ClaimAttemptResult {
  success: boolean;
  attemptToken: string;
  userId: string;
  alreadyClaimed?: boolean;
}

export interface StudioAiGeneratedQuestion {
  question: string;
  choices: Array<{ id: string; text: string }>;
  correctAnswer: { choiceId: string };
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  questionType: string;
}

export function createStudioApi(client: ApiClient) {
  return {
    // Quizzes CRUD
    listQuizzes: (params?: { organizationId?: string; status?: MarketingQuizStatus; limit?: number; offset?: number }) =>
      client.get<{ quizzes: MarketingQuiz[] }>("/v1/studio/quizzes", { params }),

    getQuiz: (id: string) =>
      client.get<{ quiz: MarketingQuiz }>(`/v1/studio/quizzes/${id}`),

    createQuiz: (data: { title: string; description?: string; coverImageUrl?: string; settings?: Record<string, unknown>; organizationId?: string }) =>
      client.post<{ quiz: MarketingQuiz }>("/v1/studio/quizzes", data),

    updateQuiz: (id: string, data: Partial<MarketingQuiz>) =>
      client.patch<{ quiz: MarketingQuiz }>(`/v1/studio/quizzes/${id}`, data),

    deleteQuiz: (id: string) =>
      client.delete<void>(`/v1/studio/quizzes/${id}`),

    // Question snapshot management inside quiz
    addManualQuestion: (quizId: string, data: {
      question: string;
      choices: Array<{ id: string; text: string }>;
      correctAnswer: { choiceId: string } | string;
      explanation?: string;
      difficulty?: "easy" | "medium" | "hard";
      topic?: string;
      questionType?: string;
      addToQuestionBank?: boolean;
    }) =>
      client.post<{ question: MarketingQuizQuestionSnapshot }>(`/v1/studio/quizzes/${quizId}/questions/manual`, data),

    addQuestionFromCourse: (quizId: string, sourceQuestionId: string) =>
      client.post<{ question: MarketingQuizQuestionSnapshot }>(`/v1/studio/quizzes/${quizId}/questions/from-course`, { sourceQuestionId }),

    addQuestionFromBank: (quizId: string, bankQuestionId: string) =>
      client.post<{ question: MarketingQuizQuestionSnapshot }>(`/v1/studio/quizzes/${quizId}/questions/from-bank`, { bankQuestionId }),

    updateQuestionSnapshot: (quizId: string, questionId: string, data: Partial<MarketingQuizQuestionSnapshot>) =>
      client.patch<{ question: MarketingQuizQuestionSnapshot }>(`/v1/studio/quizzes/${quizId}/questions/${questionId}`, data),

    deleteQuestionSnapshot: (quizId: string, questionId: string) =>
      client.delete<void>(`/v1/studio/quizzes/${quizId}/questions/${questionId}`),

    batchAddQuestions: (quizId: string, items: BatchAddQuestionItemInput[]) =>
      client.post<{ questions: MarketingQuizQuestionSnapshot[]; addedCount: number }>(`/v1/studio/quizzes/${quizId}/questions/batch`, { items }),

    reorderQuestions: (quizId: string, orderedQuestionIds: string[]) =>
      client.put<{ success: boolean }>(`/v1/studio/quizzes/${quizId}/questions/reorder`, { orderedQuestionIds }),

    getQuizAnalytics: (quizId: string) =>
      client.get<{ analytics: QuizAnalyticsSummary }>(`/v1/studio/quizzes/${quizId}/analytics`),

    // Unified Question Bank
    getQuestionBankSources: () =>
      client.get<QuestionBankSourcesResponse>("/v1/studio/question-bank/sources"),

    searchQuestionBank: (params?: SearchQuestionBankFilters) =>
      client.get<{ questions: UnifiedQuestionBankItem[]; total: number }>("/v1/studio/question-bank/search", { params }),

    listQuestionBank: (params?: { organizationId?: string; topic?: string; difficulty?: string; questionType?: string; search?: string; limit?: number; offset?: number }) =>
      client.get<{ questions: MarketingQuestionBankItem[] }>("/v1/studio/question-bank", { params }),

    createQuestionBankItem: (data: Omit<MarketingQuestionBankItem, "id" | "createdAt" | "updatedAt">) =>
      client.post<{ item: MarketingQuestionBankItem }>("/v1/studio/question-bank", data),

    updateQuestionBankItem: (id: string, data: Partial<MarketingQuestionBankItem>) =>
      client.patch<{ item: MarketingQuestionBankItem }>(`/v1/studio/question-bank/${id}`, data),

    deleteQuestionBankItem: (id: string) =>
      client.delete<void>(`/v1/studio/question-bank/${id}`),

    // AI Generation
    generateAiQuestions: (data: {
      topic: string;
      questionType: string;
      difficulty: "easy" | "medium" | "hard";
      count: number;
      instructions?: string;
      sampleQuestions?: Array<{ question: string; choices?: string[]; explanation?: string }>;
    }) =>
      client.post<{ questions: StudioAiGeneratedQuestion[] }>("/v1/studio/ai/generate", data),

    // Public Quiz Taking (Guest / Student / Preview)
    getPublicQuiz: (slug: string, options?: { preview?: boolean }) =>
      client.get<{ quiz: PublicQuizPayload }>(`/v1/public/quizzes/${slug}`, {
        params: options?.preview ? { preview: "true" } : undefined,
      }),

    submitPublicAttempt: (
      slug: string,
      data: { answers: Record<string, unknown>; idempotencyKey?: string },
      options?: { preview?: boolean },
    ) =>
      client.post<{ result: PublicAttemptResult }>(
        `/v1/public/quizzes/${slug}/attempt`,
        data,
        {
          params: options?.preview ? { preview: "true" } : undefined,
        },
      ),

    getPublicAttemptResult: (token: string) =>
      client.get<{ result: PublicAttemptResult }>(`/v1/public/quizzes/attempts/${token}`),

    claimPublicAttempt: (token: string) =>
      client.post<ClaimAttemptResult>(`/v1/public/quizzes/attempts/${token}/claim`),

    getPublicAttemptSolutions: (token: string) =>
      client.get<{ solutions: PublicAttemptSolutionsResult }>(
        `/v1/public/quizzes/attempts/${token}/solutions`,
      ),
  };
}
