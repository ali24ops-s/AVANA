import type { ApiClient } from "./client.js";
import { createApiClient, getApiBaseUrl } from "./client.js";

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
  questionId?: string;
  optionText: string;
  sortOrder: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface PollQuestion {
  id: string;
  pollId?: string;
  questionText: string;
  description?: string | null;
  questionType: PollQuestionType;
  isRequired: boolean;
  sortOrder: number;
  minChoices?: number | null;
  maxChoices?: number | null;
  options?: PollOption[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Poll {
  id: string;
  organizationId?: string | null;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status: PollStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  settings: PollSettings;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  questions?: PollQuestion[];
  questionsCount?: number;
  responsesCount?: number;
}

export interface CreatePollInput {
  title: string;
  organizationId?: string | null;
  slug?: string;
  description?: string;
  coverImageUrl?: string;
  startsAt?: string | null;
  endsAt?: string | null;
  settings?: PollSettings;
}

export interface UpdatePollInput {
  title?: string;
  slug?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status?: PollStatus;
  startsAt?: string | null;
  endsAt?: string | null;
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
  textAnswers?: string[]; // Only returned to admins/managers
}

export interface PollResults {
  pollId: string;
  pollTitle: string;
  totalResponses: number;
  questions: PollQuestionResult[];
  isAdmin: boolean;
}

export interface PublicSanitizedPoll {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status: PollStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  settings: {
    allowAnonymous?: boolean;
    showResultsAfterVote?: boolean;
    requireAllQuestions?: boolean;
    ctaTitle?: string;
    ctaUrl?: string;
    ctaButtonText?: string;
  };
  questions?: Array<{
    id: string;
    questionText: string;
    description?: string | null;
    questionType: PollQuestionType;
    isRequired: boolean;
    sortOrder: number;
    minChoices?: number | null;
    maxChoices?: number | null;
    options?: Array<{
      id: string;
      optionText: string;
      sortOrder: number;
    }>;
  }>;
  userVoted?: boolean;
}

export function createPollsApi(client: ApiClient) {
  return {
    // Studio Management Endpoints
    listPolls: (params?: { organizationId?: string; status?: PollStatus; limit?: number; offset?: number }) =>
      client.get<{ polls: Poll[] }>("/v1/studio/polls", { params }),

    getPollById: (id: string) =>
      client.get<{ poll: Poll }>(`/v1/studio/polls/${id}`),

    createPoll: (data: CreatePollInput) =>
      client.post<{ poll: Poll }>("/v1/studio/polls", data),

    updatePoll: (id: string, data: UpdatePollInput) =>
      client.patch<{ poll: Poll }>(`/v1/studio/polls/${id}`, data),

    deletePoll: (id: string) =>
      client.delete<{ success: boolean }>(`/v1/studio/polls/${id}`),

    publishPoll: (id: string) =>
      client.post<{ poll: Poll }>(`/v1/studio/polls/${id}/publish`),

    closePoll: (id: string) =>
      client.post<{ poll: Poll }>(`/v1/studio/polls/${id}/close`),

    // Question & Option Management
    createQuestion: (pollId: string, data: CreatePollQuestionInput) =>
      client.post<{ question: PollQuestion }>(`/v1/studio/polls/${pollId}/questions`, data),

    updateQuestion: (pollId: string, questionId: string, data: UpdatePollQuestionInput) =>
      client.patch<{ question: PollQuestion }>(`/v1/studio/polls/${pollId}/questions/${questionId}`, data),

    deleteQuestion: (pollId: string, questionId: string) =>
      client.delete<{ success: boolean }>(`/v1/studio/polls/${pollId}/questions/${questionId}`),

    reorderQuestions: (pollId: string, questionIds: string[]) =>
      client.put<{ success: boolean }>(`/v1/studio/polls/${pollId}/questions/reorder`, { questionIds }),

    // Results & Export
    getPollResults: (id: string) =>
      client.get<{ results: PollResults }>(`/v1/studio/polls/${id}/results`),

    getExportCsvUrl: (id: string) => {
      const baseUrl = getApiBaseUrl();
      return `${baseUrl}/v1/studio/polls/${id}/export`;
    },

    // Public Taking Endpoints
    getPublicPoll: (slug: string) =>
      client.get<{ poll: PublicSanitizedPoll }>(`/v1/public/polls/${slug}`),

    submitVote: (slug: string, body: SubmitPollVoteInput) =>
      client.post<{ success: boolean; responseId: string; results?: PollResults }>(
        `/v1/public/polls/${slug}/vote`,
        body,
      ),

    getPublicResults: (slug: string) =>
      client.get<{ results: PollResults }>(`/v1/public/polls/${slug}/results`),
  };
}

let _pollsApi: ReturnType<typeof createPollsApi> | null = null;

export function getPollsApi() {
  if (!_pollsApi) {
    const client = createApiClient({ baseUrl: getApiBaseUrl() });
    _pollsApi = createPollsApi(client);
  }
  return _pollsApi;
}
