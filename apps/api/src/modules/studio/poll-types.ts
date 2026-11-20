/**
 * Core type definitions for AVANA Studio: Polls & Surveys Module.
 */

export type PollStatus = "draft" | "published" | "closed" | "archived";

export type PollQuestionType = "single_choice" | "multiple_choice" | "short_text";

export interface PollSettings {
  allowAnonymous?: boolean;
  showResultsAfterVote?: boolean;
  requireAllQuestions?: boolean;
  ctaTitle?: string;
  ctaUrl?: string;
  ctaButtonText?: string;
  [key: string]: unknown;
}

export interface PollOption {
  id: string;
  questionId: string;
  optionText: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PollQuestion {
  id: string;
  pollId: string;
  questionText: string;
  description?: string | null;
  questionType: PollQuestionType;
  isRequired: boolean;
  sortOrder: number;
  minChoices?: number | null;
  maxChoices?: number | null;
  options?: PollOption[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Poll {
  id: string;
  organizationId?: string | null;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status: PollStatus;
  startsAt?: Date | null;
  endsAt?: Date | null;
  settings: PollSettings;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  questions?: PollQuestion[];
  questionsCount?: number;
  responsesCount?: number;
}

export interface PollResponse {
  id: string;
  pollId: string;
  participantId: string; // HMAC-SHA256 hashed participant identifier
  userId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  completedAt: Date;
  answers?: PollAnswer[];
}

export interface PollAnswer {
  id: string;
  responseId: string;
  questionId: string;
  textAnswer?: string | null;
  selectedOptionIds?: string[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Inputs / DTOs
// ---------------------------------------------------------------------------

export interface CreatePollInput {
  title: string;
  organizationId?: string | null;
  slug?: string;
  description?: string;
  coverImageUrl?: string;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  settings?: PollSettings;
}

export interface UpdatePollInput {
  title?: string;
  slug?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status?: PollStatus;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  settings?: PollSettings;
}

export interface CreatePollQuestionInput {
  questionText: string;
  description?: string | null;
  questionType: PollQuestionType;
  isRequired?: boolean;
  sortOrder?: number;
  minChoices?: number | null;
  maxChoices?: number | null;
  options?: Array<{ optionText: string; sortOrder?: number }>;
}

export interface UpdatePollQuestionInput {
  questionText?: string;
  description?: string | null;
  questionType?: PollQuestionType;
  isRequired?: boolean;
  sortOrder?: number;
  minChoices?: number | null;
  maxChoices?: number | null;
  options?: Array<{ id?: string; optionText: string; sortOrder?: number }>;
}

export interface SubmitPollVoteAnswerInput {
  questionId: string;
  selectedOptionId?: string; // For single_choice
  selectedOptionIds?: string[]; // For multiple_choice
  textAnswer?: string; // For short_text
}

export interface SubmitPollVoteInput {
  answers: Record<string, SubmitPollVoteAnswerInput | string | string[]>;
}

// ---------------------------------------------------------------------------
// Results / Analytics DTOs
// ---------------------------------------------------------------------------

export interface PollOptionResult {
  optionId: string;
  optionText: string;
  voteCount: number;
  percentage: number;
}

export interface PollQuestionResult {
  questionId: string;
  questionText: string;
  questionType: PollQuestionType;
  totalAnswers: number;
  options?: PollOptionResult[];
  textAnswers?: string[]; // Only present in admin results!
}

export interface PollResults {
  pollId: string;
  pollTitle: string;
  totalResponses: number;
  questions: PollQuestionResult[];
  isAdmin: boolean;
}
