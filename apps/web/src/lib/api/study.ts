/**
 * Study consumption & analytics API calls (PR6-7) using typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  FlashcardListResponse,
  FlashcardReviewQueueResponse,
  SubmitFlashcardReviewRequest,
  SubmitFlashcardReviewResponse,
  QuizListResponse,
  QuizResponse,
  SubmitQuizAttemptRequest,
  SubmitQuizAttemptResponse,
  QuizAttemptResponse,
  StudyAnalyticsResponse,
  StudyRecommendationsResponse,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createStudyApi(client: ApiClient) {
  return {
    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/flashcards
     * Lists all flashcards for a course along with the count of cards currently due.
     */
    listFlashcards(
      organizationId: string,
      courseId: string,
    ): Promise<FlashcardListResponse> {
      return client.get<FlashcardListResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/flashcards`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/flashcards/review-queue
     * Lists due flashcards for spaced-repetition review.
     */
    getFlashcardReviewQueue(
      organizationId: string,
      courseId: string,
    ): Promise<FlashcardReviewQueueResponse> {
      return client.get<FlashcardReviewQueueResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/flashcards/review-queue`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/flashcards/:flashcardId/review
     * Submits a flashcard review rating (again/hard/good/easy).
     */
    submitFlashcardReview(
      organizationId: string,
      courseId: string,
      flashcardId: string,
      data: SubmitFlashcardReviewRequest,
    ): Promise<SubmitFlashcardReviewResponse> {
      return client.post<SubmitFlashcardReviewResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/flashcards/${flashcardId}/review`,
        data,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/quizzes
     * Lists published quizzes for a course.
     */
    listQuizzes(
      organizationId: string,
      courseId: string,
    ): Promise<QuizListResponse> {
      return client.get<QuizListResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/quizzes`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId
     * Gets quiz details and questions for taking an attempt.
     */
    getQuiz(
      organizationId: string,
      courseId: string,
      quizId: string,
    ): Promise<QuizResponse> {
      return client.get<QuizResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/quizzes/${quizId}`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId/attempts
     * Submits answers for a quiz attempt and returns scored results.
     */
    submitQuizAttempt(
      organizationId: string,
      courseId: string,
      quizId: string,
      data: SubmitQuizAttemptRequest,
    ): Promise<SubmitQuizAttemptResponse> {
      return client.post<SubmitQuizAttemptResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/quizzes/${quizId}/attempts`,
        data,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/quizzes/:quizId/attempts/:attemptId
     * Gets the details of a previous quiz attempt.
     */
    getQuizAttempt(
      organizationId: string,
      courseId: string,
      quizId: string,
      attemptId: string,
    ): Promise<QuizAttemptResponse> {
      return client.get<QuizAttemptResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/quizzes/${quizId}/attempts/${attemptId}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/study/analytics
     * Gets aggregated study metrics (lesson progress, flashcard mastery, quiz performance, weak areas).
     */
    getStudyAnalytics(
      organizationId: string,
      courseId: string,
    ): Promise<StudyAnalyticsResponse> {
      return client.get<StudyAnalyticsResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/study/analytics`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/courses/:courseId/study/recommendations
     * Gets actionable next steps derived from study data.
     */
    getStudyRecommendations(
      organizationId: string,
      courseId: string,
    ): Promise<StudyRecommendationsResponse> {
      return client.get<StudyRecommendationsResponse>(
        `/v1/organizations/${organizationId}/courses/${courseId}/study/recommendations`,
      );
    },
  };
}

export type StudyApi = ReturnType<typeof createStudyApi>;
