/**
 * Student Platform API client.
 *
 * Implements typed API calls to the Phase 2 Teacher Platform student routes:
 *  - Classrooms: join, list, leave
 *  - Exams: list classroom exams, list all student teacher exams
 *  - Attempt: start, get current attempt, save answer, submit
 *  - Results: get student review
 *
 * Strictly adheres to backend contracts in apps/api/src/modules/teacher-platform/student-routes.ts
 */

import type {
  Classroom,
  ClassroomMember,
  ClassroomStatus,
  ClassroomMemberStatus,
  RuntimeExamState,
  AttemptStatus,
  StudentSanitizedQuestion,
  QuestionType,
  QuestionGradingStatus,
  AttemptGradingStatus,
  TrueFalseStatementReview,
  ClassroomAssignment,
  AssignmentSubmission,
  ClassroomContent,
  RuntimeAssignmentState,
  DescriptiveAnswerIntegrityData,
  StudentExamResultState,
  TeacherConversation,
  TeacherConversationMessage,
  TeacherConversationWithDetails,
  TeacherMessageCategory,
  TeacherMessageStatus,
} from "@avana/domain";
import type { ErrorEnvelope } from "@avana/contracts";
import { type ApiClient, generateUUID } from "./client.js";
import { ApiError } from "./errors.js";


// ---------------------------------------------------------------------------
// DTOs & Response Shapes (mirrored exactly from backend services)
// ---------------------------------------------------------------------------

export interface StudentClassroomDTO {
  id: string;
  organizationId: string;
  teacherId: string;
  title: string;
  description: string | null;
  status: ClassroomStatus;
  memberStatus: ClassroomMemberStatus;
  firstJoinedAt: string;
  lastJoinedAt: string;
}

export interface JoinClassroomResponse {
  classroom: Classroom;
  member: ClassroomMember;
  membership: ClassroomMember;
  status: "joined" | "rejoined";
}

export interface StudentExamListDTO {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  passingScorePercentage: number;
  showResultsImmediately: boolean;
  allowBackNavigation: boolean;
  perQuestionTimeSeconds?: number | null;
  runtimeState: RuntimeExamState;
  hasAttempt: boolean;
  attemptStatus: AttemptStatus | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
}

export interface StudentAttemptDTO {
  id: string;
  examId: string;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  allowBackNavigation: boolean;
  perQuestionTimeSeconds?: number | null;
  questions: StudentSanitizedQuestion[];
  savedAnswers: Array<{
    questionId: string;
    selectedOptionId: string | null;
    textAnswer?: string | null;
    answeredAt?: string;
    finalizedAt?: string | null;
  }>;
}

export interface StudentAttemptResultDTO {
  id: string;
  examId: string;
  status: AttemptStatus;
  submittedAt: string | null;
  showResultsImmediately: boolean;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  passed?: boolean | null;
}

export interface StudentQuestionReviewDTO {
  questionId: string;
  orderIndex: number;
  questionType?: QuestionType;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  statements?: TrueFalseStatementReview[];
  selectedOptionId: string | null;
  textAnswer?: string | null;
  teacherFeedback?: string | null;
  gradingStatus?: QuestionGradingStatus;
  correctOptionId?: string;
  explanation?: string | null;
  isCorrect?: boolean | null;
  pointsEarned?: number | null;
  maxPoints?: number;
}

export interface StudentReviewDTO {
  id: string;
  examId: string;
  status: AttemptStatus;
  gradingStatus?: AttemptGradingStatus;
  submittedAt: string | null;
  resultsReleased: boolean;
  state?: StudentExamResultState;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  passed?: boolean | null;
  questions?: StudentQuestionReviewDTO[];
  message?: string;
}

// ---------------------------------------------------------------------------
// Student Platform API Factory
// ---------------------------------------------------------------------------

export function createStudentPlatformApi(client: ApiClient) {
  return {
    // -----------------------------------------------------------------------
    // Classrooms
    // -----------------------------------------------------------------------

    /**
     * POST /v1/student/classrooms/join — Join classroom via invite code.
     */
    joinClassroom(inviteCode: string): Promise<JoinClassroomResponse> {
      return client.post<JoinClassroomResponse>("/v1/student/classrooms/join", {
        inviteCode: inviteCode.trim().toUpperCase(),
      });
    },

    /**
     * GET /v1/student/classrooms — List student's active enrolled classrooms.
     */
    listClassrooms(): Promise<{ classrooms: StudentClassroomDTO[] }> {
      return client.get<{ classrooms: StudentClassroomDTO[] }>("/v1/student/classrooms");
    },

    /**
     * POST /v1/student/classrooms/:classroomId/leave — Leave an enrolled classroom.
     */
    leaveClassroom(classroomId: string): Promise<{ member: ClassroomMember }> {
      return client.post<{ member: ClassroomMember }>(
        `/v1/student/classrooms/${classroomId}/leave`,
      );
    },

    // -----------------------------------------------------------------------
    // Exams
    // -----------------------------------------------------------------------

    /**
     * GET /v1/student/classrooms/:classroomId/exams — List published exams for classroom.
     */
    listClassroomExams(classroomId: string): Promise<{ exams: StudentExamListDTO[] }> {
      return client.get<{ exams: StudentExamListDTO[] }>(
        `/v1/student/classrooms/${classroomId}/exams`,
      );
    },

    /**
     * GET /v1/student/exams — List all published exams across enrolled classrooms.
     */
    listAllStudentExams(): Promise<{ exams: StudentExamListDTO[] }> {
      return client.get<{ exams: StudentExamListDTO[] }>("/v1/student/exams");
    },

    // -----------------------------------------------------------------------
    // Attempt Lifecycle
    // -----------------------------------------------------------------------

    /**
     * POST /v1/student/exams/:examId/start — Start a new attempt.
     */
    startExam(examId: string): Promise<{ attempt: StudentAttemptDTO }> {
      return client.post<{ attempt: StudentAttemptDTO }>(
        `/v1/student/exams/${examId}/start`,
      );
    },

    /**
     * GET /v1/student/exams/:examId/current — Get current in-progress or completed attempt.
     */
    getCurrentAttempt(examId: string): Promise<{ attempt: StudentAttemptDTO | null }> {
      return client.get<{ attempt: StudentAttemptDTO | null }>(
        `/v1/student/exams/${examId}/current`,
      );
    },

    /**
     * PUT /v1/student/exams/:examId/answers/:questionId — Save single answer choice or descriptive text.
     */
    saveAnswer(
      examId: string,
      questionId: string,
      selectedOptionId?: string | null,
      textAnswer?: string | null,
      finalized?: boolean,
      activeDurationMs?: number | null,
      tabSwitchesCount?: number | null,
      integrityData?: DescriptiveAnswerIntegrityData | null,
      booleanAnswers?: Record<string, boolean> | null,
    ): Promise<{ success: boolean }> {
      return client.put<{ success: boolean }>(
        `/v1/student/exams/${examId}/answers/${questionId}`,
        {
          selectedOptionId,
          textAnswer,
          finalized,
          activeDurationMs: activeDurationMs ?? undefined,
          tabSwitchesCount: tabSwitchesCount ?? undefined,
          integrityData: integrityData ?? undefined,
          booleanAnswers: booleanAnswers ?? undefined,
        },
      );
    },

    /**
     * POST /v1/student/exams/:examId/submit — Submit attempt for final grading.
     */
    submitExam(examId: string): Promise<{ result: StudentAttemptResultDTO }> {
      return client.post<{ result: StudentAttemptResultDTO }>(
        `/v1/student/exams/${examId}/submit`,
      );
    },

    // -----------------------------------------------------------------------
    // Results & Review
    // -----------------------------------------------------------------------

    /**
     * GET /v1/student/exams/:examId/review — Get student results & question review.
     */
    getReview(examId: string): Promise<{ review: StudentReviewDTO }> {
      return client.get<{ review: StudentReviewDTO }>(
        `/v1/student/exams/${examId}/review`,
      );
    },

    // -----------------------------------------------------------------------
    // Assignments
    // -----------------------------------------------------------------------

    /**
     * GET /v1/student/classrooms/:classroomId/assignments — List student assignments
     */
    getClassroomAssignments(
      classroomId: string,
    ): Promise<{ assignments: StudentAssignmentListItemDTO[] }> {
      return client.get<{ assignments: StudentAssignmentListItemDTO[] }>(
        `/v1/student/classrooms/${classroomId}/assignments`,
      );
    },

    /**
     * GET /v1/student/assignments/:assignmentId — Get assignment details & my submission
     */
    getAssignment(
      assignmentId: string,
    ): Promise<StudentAssignmentDetailDTO> {
      return client.get<StudentAssignmentDetailDTO>(
        `/v1/student/assignments/${assignmentId}`,
      );
    },

    /**
     * POST /v1/student/assignments/attachments — Upload assignment attachment file
     */
    async uploadAssignmentAttachment(file: File): Promise<{
      attachmentUrl: string;
      attachmentName: string;
      attachmentSizeBytes: number;
      storageKey: string;
    }> {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const response = await fetch("/v1/student/assignments/attachments", {
        method: "POST",
        headers: {
          "x-request-id": generateUUID(),
        },
        credentials: "include",
        body: formData,
      });

      let data: unknown;
      try {
        if (typeof response.text === "function") {
          const text = await response.text();
          data = text ? JSON.parse(text) : undefined;
        } else if (typeof response.json === "function") {
          data = await response.json();
        }
      } catch {
        data = null;
      }

      if (!response.ok) {
        if (
          data &&
          typeof data === "object" &&
          "error" in data &&
          data.error &&
          typeof (data as { error: unknown }).error === "object"
        ) {
          throw new ApiError(data as ErrorEnvelope);
        }
        throw new Error(
          (data as { message?: string })?.message || "خطا در بارگذاری فایل پیوست.",
        );
      }

      const resObj = data as {
        attachment_url?: string;
        attachmentUrl?: string;
        attachment_name?: string;
        attachmentName?: string;
        attachment_size_bytes?: number;
        attachmentSizeBytes?: number;
        storage_key?: string;
        storageKey?: string;
      };

      return {
        attachmentUrl: resObj.attachmentUrl || resObj.attachment_url || "",
        attachmentName: resObj.attachmentName || resObj.attachment_name || file.name,
        attachmentSizeBytes: resObj.attachmentSizeBytes ?? resObj.attachment_size_bytes ?? file.size,
        storageKey: resObj.storageKey || resObj.storage_key || "",
      };
    },

    /**
     * POST /v1/student/assignments/:assignmentId/submit — Submit or resubmit assignment answer
     */
    submitAssignment(
      assignmentId: string,
      data: {
        answerText?: string;
        attachmentUrl?: string | null;
        attachmentName?: string | null;
        attachmentSizeBytes?: number | null;
      },
    ): Promise<{ submission: AssignmentSubmission }> {
      return client.post<{ submission: AssignmentSubmission }>(
        `/v1/student/assignments/${assignmentId}/submit`,
        data,
      );
    },

    // -----------------------------------------------------------------------
    // Classroom Educational Contents
    // -----------------------------------------------------------------------

    /**
     * GET /v1/student/classrooms/:classroomId/contents — List published contents for enrolled student
     */
    listClassroomContents(
      classroomId: string,
    ): Promise<{ contents: ClassroomContent[] }> {
      return client.get<{ contents: ClassroomContent[] }>(
        `/v1/student/classrooms/${classroomId}/contents`,
      );
    },

    /**
     * GET /v1/student/contents/:contentId — Get published content details
     */
    getContentDetails(
      contentId: string,
    ): Promise<{ content: ClassroomContent }> {
      return client.get<{ content: ClassroomContent }>(
        `/v1/student/contents/${contentId}`,
      );
    },

    // -----------------------------------------------------------------------
    // Teacher Messages & Conversations
    // -----------------------------------------------------------------------

    /**
     * GET /v1/student/conversations — List student conversations.
     */
    listConversations(query?: {
      classroomId?: string;
      status?: TeacherMessageStatus;
      category?: TeacherMessageCategory;
      limit?: number;
      offset?: number;
    }): Promise<{ conversations: TeacherConversationWithDetails[]; total: number }> {
      const params = new URLSearchParams();
      if (query?.classroomId) params.set("classroomId", query.classroomId);
      if (query?.status) params.set("status", query.status);
      if (query?.category) params.set("category", query.category);
      if (query?.limit !== undefined) params.set("limit", String(query.limit));
      if (query?.offset !== undefined) params.set("offset", String(query.offset));
      const qs = params.toString();
      return client.get<{ conversations: TeacherConversationWithDetails[]; total: number }>(
        `/v1/student/conversations${qs ? `?${qs}` : ""}`,
      );
    },

    /**
     * GET /v1/student/conversations/:conversationId — Get conversation thread details.
     */
    getConversation(
      conversationId: string,
    ): Promise<{ conversation: TeacherConversationWithDetails; messages: TeacherConversationMessage[] }> {
      return client.get<{ conversation: TeacherConversationWithDetails; messages: TeacherConversationMessage[] }>(
        `/v1/student/conversations/${conversationId}`,
      );
    },

    /**
     * POST /v1/student/conversations — Start a new conversation with classroom teacher.
     */
    createConversation(input: {
      classroomId: string;
      category: TeacherMessageCategory;
      subject: string;
      body: string;
    }): Promise<{ conversation: TeacherConversation; message: TeacherConversationMessage }> {
      return client.post<{ conversation: TeacherConversation; message: TeacherConversationMessage }>(
        "/v1/student/conversations",
        input,
      );
    },

    /**
     * POST /v1/student/conversations/:conversationId/reply — Reply to ongoing conversation.
     */
    replyToConversation(
      conversationId: string,
      input: { body: string },
    ): Promise<{ message: TeacherConversationMessage; conversation: TeacherConversation }> {
      return client.post<{ message: TeacherConversationMessage; conversation: TeacherConversation }>(
        `/v1/student/conversations/${conversationId}/reply`,
        input,
      );
    },
  };
}

export interface StudentAssignmentListItemDTO {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  startsAt: string;
  dueAt: string;
  status: "draft" | "published" | "archived";
  runtimeState: RuntimeAssignmentState;
  studentStatus: "submitted" | "can_submit" | "not_started" | "expired";
  hasSubmitted: boolean;
  submittedAt: string | null;
  createdAt: string;
}

export interface StudentAssignmentDetailDTO {
  assignment: ClassroomAssignment;
  submission: AssignmentSubmission | null;
  runtimeState: RuntimeAssignmentState;
  canSubmit: boolean;
}

export type StudentPlatformApi = ReturnType<typeof createStudentPlatformApi>;
