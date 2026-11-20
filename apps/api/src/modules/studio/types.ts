
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
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  questions?: MarketingQuizQuestionSnapshot[];
  questionsCount?: number;
  attemptsCount?: number;
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
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface MarketingQuizAttempt {
  id: string;
  marketingQuizId: string;
  attemptToken: string;
  idempotencyKey?: string | null;
  userId?: string | null;
  status: "in_progress" | "completed";
  score: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  answers: Record<string, string>;
  questionSnapshots?: Array<{
    id: string;
    question: string;
    choices: MarketingQuizChoice[];
  }> | null;
  startedAt: Date;
  completedAt: Date;
}

/**
 * Public payload sent to guest or student taking the quiz.
 * NEVER contains correct answers or explanations!
 */
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

/**
 * Sanitized question review for guest participant.
 * Displays only question, choices, user's choice, and correctness status.
 * NEVER leaks correctAnswer or explanation!
 */
export interface PublicAttemptReviewQuestion {
  id: string;
  question: string;
  choices: MarketingQuizChoice[];
  userAnswer?: string | null;
  isCorrect: boolean;
}

/**
 * Sanitized attempt result returned to participant.
 * Displays score, counts, and question review summaries.
 */
export interface PublicAttemptResult {
  attemptToken: string;
  quizTitle: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  completedAt: Date;
  settings?: Record<string, unknown>;
  isDraftPreview?: boolean;
  questionReviews?: PublicAttemptReviewQuestion[];
}

/**
 * Full solution question for authenticated owner of the attempt.
 */
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

/**
 * Full solutions payload returned ONLY to authenticated owner.
 */
export interface PublicAttemptSolutionsResult {
  attemptToken: string;
  quizTitle: string;
  score: number;
  correctCount: number;
  wrongCount: number;
  totalQuestions: number;
  completedAt: Date;
  questions: PublicAttemptSolutionQuestion[];
}

export interface ClaimAttemptResult {
  success: boolean;
  attemptToken: string;
  userId: string;
  alreadyClaimed?: boolean;
}

export interface CreateMarketingQuizInput {
  organizationId?: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateMarketingQuizInput {
  title?: string;
  description?: string;
  coverImageUrl?: string;
  status?: MarketingQuizStatus;
  settings?: Record<string, unknown>;
}

export interface SubmitAttemptInput {
  idempotencyKey?: string;
  answers: Record<string, string>;
  startedAt?: string;
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

export interface StudioAiGenerateInput {
  topic: string;
  questionType:
    | "conceptual"
    | "mechanism_of_action"
    | "clinical_pharmacology"
    | "adverse_effects"
    | "drug_comparison"
    | "drug_interactions"
    | "dosage_calculations"
    | "clinical_scenario";
  difficulty: "easy" | "medium" | "hard";
  count: number;
  instructions?: string;
  sampleQuestions?: Array<{
    question: string;
    choices?: string[];
    explanation?: string;
  }>;
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
  createdAt: Date | string;
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

export interface BatchAddQuestionsInput {
  items: BatchAddQuestionItemInput[];
}

