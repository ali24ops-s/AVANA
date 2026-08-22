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
  FlashcardSummaryResponse,
  CreateFlashcardStudySessionRequest,
  CreateFlashcardStudySessionResponse,
  FlashcardStudySessionsListResponse,
  FlashcardStudySessionDetailResponse,
  UpdateFlashcardStudySessionProgressRequest,
  UpdateFlashcardStudySessionProgressResponse,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createStudyApi(client: ApiClient) {
  return {
    /**
     * POST /v1/organizations/:organizationId/study/flashcard-sessions
     * Creates a new persistent flashcard study session snapshot.
     */
    createFlashcardStudySession(
      organizationId: string,
      data: CreateFlashcardStudySessionRequest,
    ): Promise<CreateFlashcardStudySessionResponse> {
      return client.post<CreateFlashcardStudySessionResponse>(
        `/v1/organizations/${organizationId}/study/flashcard-sessions`,
        data,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/study/flashcard-sessions
     * Lists active in-progress flashcard study sessions for the user.
     */
    getActiveFlashcardStudySessions(
      organizationId: string,
    ): Promise<FlashcardStudySessionsListResponse> {
      return client.get<FlashcardStudySessionsListResponse>(
        `/v1/organizations/${organizationId}/study/flashcard-sessions`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/study/flashcard-sessions/:sessionId
     * Gets a flashcard study session and its snapshotted card queue.
     */
    getFlashcardStudySession(
      organizationId: string,
      sessionId: string,
    ): Promise<FlashcardStudySessionDetailResponse> {
      return client.get<FlashcardStudySessionDetailResponse>(
        `/v1/organizations/${organizationId}/study/flashcard-sessions/${sessionId}`,
      );
    },

    /**
     * PATCH /v1/organizations/:organizationId/study/flashcard-sessions/:sessionId/progress
     * Updates session index and card progress.
     */
    updateFlashcardStudySessionProgress(
      organizationId: string,
      sessionId: string,
      data: UpdateFlashcardStudySessionProgressRequest,
    ): Promise<UpdateFlashcardStudySessionProgressResponse> {
      return client.patch<UpdateFlashcardStudySessionProgressResponse>(
        `/v1/organizations/${organizationId}/study/flashcard-sessions/${sessionId}/progress`,
        data,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/study/flashcard-sessions/:sessionId/complete
     * Explicitly completes a study session.
     */
    completeFlashcardStudySession(
      organizationId: string,
      sessionId: string,
    ): Promise<UpdateFlashcardStudySessionProgressResponse> {
      return client.post<UpdateFlashcardStudySessionProgressResponse>(
        `/v1/organizations/${organizationId}/study/flashcard-sessions/${sessionId}/complete`,
        {},
      );
    },

    /**
     * POST /v1/organizations/:organizationId/study/flashcard-sessions/:sessionId/cancel
     * Cancels / abandons a study session (soft delete / status = cancelled).
     */
    cancelFlashcardStudySession(
      organizationId: string,
      sessionId: string,
    ): Promise<UpdateFlashcardStudySessionProgressResponse> {
      return client.post<UpdateFlashcardStudySessionProgressResponse>(
        `/v1/organizations/${organizationId}/study/flashcard-sessions/${sessionId}/cancel`,
        {},
      );
    },
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
     * GET /v1/organizations/:organizationId/study/flashcards/review-queue
     * Lists due flashcards for spaced-repetition review across multiple courses.
     */
    getMultiReviewQueue(
      organizationId: string,
      courseIds?: string[],
      documentIds?: string[],
    ): Promise<FlashcardReviewQueueResponse> {
      const params = new URLSearchParams();
      if (courseIds && courseIds.length > 0) params.set("courseIds", courseIds.join(","));
      if (documentIds && documentIds.length > 0) params.set("documentIds", documentIds.join(","));
      const qs = params.toString() ? `?${params.toString()}` : "";
      return client.get<FlashcardReviewQueueResponse>(
        `/v1/organizations/${organizationId}/study/flashcards/review-queue${qs}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/study/flashcards/exam-queue
     * Lists prioritized flashcards for Exam Mode intensive review.
     */
    getExamQueue(
      organizationId: string,
      courseIds?: string[],
      limit?: number,
      documentIds?: string[],
    ): Promise<FlashcardReviewQueueResponse> {
      const params = new URLSearchParams();
      if (courseIds && courseIds.length > 0) params.set("courseIds", courseIds.join(","));
      if (documentIds && documentIds.length > 0) params.set("documentIds", documentIds.join(","));
      if (limit) params.set("limit", limit.toString());
      
      const qs = params.toString() ? `?${params.toString()}` : "";
      return client.get<FlashcardReviewQueueResponse>(
        `/v1/organizations/${organizationId}/study/flashcards/exam-queue${qs}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/study/flashcards/custom-queue
     * Lists flashcards for Custom Study (weak, forgotten, overdue, review_ahead, new).
     */
    getCustomQueue(
      organizationId: string,
      mode: "weak" | "forgotten" | "overdue" | "review_ahead" | "new",
      courseIds?: string[],
      limit?: number,
      aheadDays?: number,
      documentIds?: string[],
    ): Promise<FlashcardReviewQueueResponse> {
      const params = new URLSearchParams();
      params.set("mode", mode);
      if (courseIds && courseIds.length > 0) params.set("courseIds", courseIds.join(","));
      if (documentIds && documentIds.length > 0) params.set("documentIds", documentIds.join(","));
      if (limit) params.set("limit", limit.toString());
      if (aheadDays) params.set("aheadDays", aheadDays.toString());

      const qs = params.toString() ? `?${params.toString()}` : "";
      return client.get<FlashcardReviewQueueResponse>(
        `/v1/organizations/${organizationId}/study/flashcards/custom-queue${qs}`,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/study/flashcard-summary
     * Gets a summary of all flashcards grouped by course.
     */
    getFlashcardSummary(
      organizationId: string,
    ): Promise<FlashcardSummaryResponse> {
      return client.get<FlashcardSummaryResponse>(
        `/v1/organizations/${organizationId}/study/flashcard-summary`,
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
     * GET /v1/organizations/:organizationId/study/exams/topics
     * Gets available section and chapter tree hierarchy with question counts from DB.
     */
    getExamTopics(organizationId: string): Promise<{
      request_id: string;
      courses: Array<{
        courseId: string;
        courseTitle: string;
        questionCount: number;
        easyCount: number;
        mediumCount: number;
        hardCount: number;
        modules: Array<{
          moduleId: string;
          moduleTitle: string;
          questionCount: number;
          easyCount: number;
          mediumCount: number;
          hardCount: number;
        }>;
      }>;
      sections: Array<{
        id: string;
        title: string;
        topic: string;
        questionCount: number;
        easyCount: number;
        mediumCount: number;
        hardCount: number;
        chapters: Array<{
          id: string;
          title: string;
          topic: string;
          questionCount: number;
          easyCount: number;
          mediumCount: number;
          hardCount: number;
        }>;
      }>;
      topics: Array<{
        topic: string;
        titleFa: string;
        totalQuestions: number;
        easyCount: number;
        mediumCount: number;
        hardCount: number;
      }>;
    }> {
      return client.get(`/v1/organizations/${organizationId}/study/exams/topics`);
    },

    /**
     * POST /v1/organizations/:organizationId/study/exams/start
     * Starts a new configured exam attempt, locking and snapshotting question IDs.
     */
    startExamAttempt(
      organizationId: string,
      data: {
        sections?: string[];
        chapters?: string[];
        topics?: string[];
        questionCount?: number;
        difficulty?: string;
      },
    ): Promise<{
      request_id: string;
      attemptId: string;
      topics: string[];
      difficulty: string;
      requestedCount: number;
      questions: Array<{
        id: string;
        quizId: string;
        question: string;
        topic?: string | null;
        difficulty?: string | null;
        questionType: string;
        choices: string[] | null;
        explanation?: string | null;
      }>;
      startedAt: string;
    }> {
      return client.post(`/v1/organizations/${organizationId}/study/exams/start`, data);
    },

    /**
     * GET /v1/organizations/:organizationId/study/exams/attempts/:attemptId
     * Gets a locked exam attempt and its questions.
     */
    getExamAttemptDetail(
      organizationId: string,
      attemptId: string,
    ): Promise<{
      request_id: string;
      attempt: {
        id: string;
        quizId?: string | null;
        userId: string;
        score: number;
        answers: Record<string, unknown>;
        questionIds?: string[] | null;
        topic?: string | null;
        difficulty?: string | null;
        status?: string;
        startedAt: string;
        completedAt?: string | null;
      };
      questions: Array<{
        id: string;
        quizId: string;
        question: string;
        topic?: string | null;
        difficulty?: string | null;
        questionType: string;
        choices: string[] | null;
        correctAnswer?: unknown;
        explanation?: string | null;
      }>;
      isCompleted: boolean;
    }> {
      return client.get(
        `/v1/organizations/${organizationId}/study/exams/attempts/${attemptId}`,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/study/exams/attempts/:attemptId/answers
     * Saves user answers during an in-progress attempt for real-time persistence and refresh resilience.
     */
    saveExamAnswers(
      organizationId: string,
      attemptId: string,
      data: { answers: Array<{ questionId: string; answer: unknown }> },
    ): Promise<{
      request_id: string;
      success: boolean;
      answers: Record<string, unknown>;
    }> {
      return client.post(
        `/v1/organizations/${organizationId}/study/exams/attempts/${attemptId}/answers`,
        data,
      );
    },

    /**
     * POST /v1/organizations/:organizationId/study/exams/attempts/:attemptId/submit
     * Submits user answers for a configured exam attempt and returns evaluated result with explanations.
     */
    submitExamAttempt(
      organizationId: string,
      attemptId: string,
      data: { answers: Array<{ questionId: string; answer: unknown }> },
    ): Promise<{
      request_id: string;
      attempt: {
        id: string;
        score: number;
        correct: number;
        total: number;
        answers: Record<string, unknown>;
        completedAt: string;
      };
      attemptId: string;
      score: number;
      correct: number;
      total: number;
      passed: boolean;
      questions?: Array<{
        id: string;
        question: string;
        choices: string[] | null;
        correctAnswer: unknown;
        explanation?: string | null;
      }>;
    }> {
      return client.post(
        `/v1/organizations/${organizationId}/study/exams/attempts/${attemptId}/submit`,
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

    /**
     * POST /v1/study-sessions/start
     * Starts a new active study session for an educational activity.
     */
    startStudySession(data: {
      activityType: "lesson" | "flashcard" | "exam" | "ai_tutor" | "pdf";
      courseId?: string;
      moduleId?: string;
      lessonId?: string;
    }): Promise<{
      request_id: string;
      session: {
        id: string;
        userId: string;
        activityType: string;
        courseId?: string | null;
        moduleId?: string | null;
        lessonId?: string | null;
        startedAt: string;
        lastActivityAt: string;
        endedAt?: string | null;
        durationSeconds: number;
      };
    }> {
      return client.post("/v1/study-sessions/start", data);
    },

    /**
     * POST /v1/study-sessions/heartbeat
     * Sends a heartbeat for an active study session.
     */
    heartbeatStudySession(sessionId: string): Promise<{
      request_id: string;
      sessionId: string;
      durationSeconds: number;
      lastActivityAt: string;
    }> {
      return client.post("/v1/study-sessions/heartbeat", { sessionId });
    },

    /**
     * POST /v1/study-sessions/end
     * Ends an active study session.
     */
    endStudySession(sessionId: string): Promise<{
      request_id: string;
      sessionId: string;
      durationSeconds: number;
      endedAt: string | null;
    }> {
      return client.post("/v1/study-sessions/end", { sessionId });
    },

    /**
     * GET /v1/dashboard/stats
     * Gets all aggregated dashboard metrics (completed lessons, completed exams, streaks, weekly study time).
     */
    getDashboardStats(timezone?: string): Promise<{
      request_id: string;
      stats: {
        completedLessons: number;
        completedExams: number;
        currentStreak: number;
        longestStreak: number;
        todayIsActive: boolean;
        todayStudySeconds: number;
      };
      thisWeek: {
        seconds: number;
        minutes: number;
        formatted: string;
      };
      lastWeek: {
        seconds: number;
        minutes: number;
        formatted: string;
      };
      changePercent: number | null;
      daily: Array<{
        date: string;
        seconds: number;
        minutes: number;
      }>;
    }> {
      const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tehran";
      return client.get(`/v1/dashboard/stats?timezone=${encodeURIComponent(tz)}`);
    },

    /**
     * GET /v1/dashboard/study-time
     * Gets weekly study time metrics and breakdown for the dashboard.
     */
    getDashboardStudyTime(timezone?: string): Promise<{
      request_id: string;
      stats?: {
        completedLessons: number;
        completedExams: number;
        currentStreak: number;
        longestStreak: number;
        todayIsActive: boolean;
        todayStudySeconds: number;
      };
      thisWeek: {
        seconds: number;
        minutes: number;
        formatted: string;
      };
      lastWeek: {
        seconds: number;
        minutes: number;
        formatted: string;
      };
      changePercent: number | null;
      daily: Array<{
        date: string;
        seconds: number;
        minutes: number;
      }>;
    }> {
      const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tehran";
      return client.get(`/v1/dashboard/study-time?timezone=${encodeURIComponent(tz)}`);
    },
  };
}

export type StudyApi = ReturnType<typeof createStudyApi>;

