/**
 * Teacher Platform API client.
 *
 * Implements typed API calls to the frozen Phase 2 Teacher Platform backend routes:
 *  - Classrooms: create, list, get, update, archive, delete, regenerate-invite-code, list/remove members
 *  - Exams: create, list, get, update, publish, unpublish, close, archive, release-results
 *  - Questions: create, list, update, delete, reorder
 *  - Results: aggregate exam results and individual student attempt details
 *
 * All domain types come from @avana/domain.
 */

import type {
  Classroom,
  ClassroomMember,
  TeacherExam,
  TeacherExamQuestion,
  TeacherExamAttempt,
  TeacherExamAttemptAnswer,
  ClassroomAssignment,
  AssignmentSubmission,
  CreateClassroomInput,
  CreateExamInput,
  UpdateClassroomInput,
  UpdateExamInput,
  TeacherQuestionInput,
  GradeDescriptiveAnswerInput,
  RuntimeExamState,
  AttemptStatus,
  QuestionType,
  QuestionGradingStatus,
  AttemptGradingStatus,
} from "@avana/domain";
import type { ApiClient } from "./client.js";


// ---------------------------------------------------------------------------
// DTOs & Response Shapes (mirrored exactly from Phase 2 backend services)
// ---------------------------------------------------------------------------

export interface ClassroomWithDetails extends Classroom {
  membersCount: number;
  examsCount: number;
}

export interface ClassroomMemberWithUser extends ClassroomMember {
  user?: {
    id: string;
    email: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export interface TeacherExamWithDetails extends TeacherExam {
  runtimeState: RuntimeExamState;
  questionsCount: number;
}

export interface ScoreDistribution {
  range: string;
  count: number;
}

export interface StudentAttemptSummaryDTO {
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: AttemptStatus | "absent";
  gradingStatus?: AttemptGradingStatus;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  startedAt: string | null;
  submittedAt: string | null;
  durationMinutes: number | null;
}

export interface TeacherExamResultsAggregateDTO {
  examId: string;
  examTitle: string;
  enrolledCount: number;
  submittedCount: number;
  inProgressCount: number;
  timedOutCount: number;
  absentCount: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  passingRate: number | null;
  scoreDistribution: ScoreDistribution[];
  students: StudentAttemptSummaryDTO[];
}

export interface StudentQuestionReviewDTO {
  questionId: string;
  orderIndex: number;
  questionType?: QuestionType;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
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

export interface StudentExamResultForTeacherDTO {
  attempt: StudentAttemptSummaryDTO;
  questions: StudentQuestionReviewDTO[];
}

// ---------------------------------------------------------------------------
// Teacher API Factory
// ---------------------------------------------------------------------------

export function createTeacherApi(client: ApiClient) {
  return {
    // -----------------------------------------------------------------------
    // Classrooms
    // -----------------------------------------------------------------------

    /**
     * POST /v1/organizations/:organizationId/teacher/classrooms — Create a classroom.
     */
    createClassroom(
      organizationId: string,
      input: Omit<CreateClassroomInput, "organizationId">,
    ): Promise<{ classroom: Classroom }> {
      return client.post<{ classroom: Classroom }>(
        `/v1/organizations/${organizationId}/teacher/classrooms`,
        input,
      );
    },

    /**
     * GET /v1/organizations/:organizationId/teacher/classrooms — List classrooms for teacher.
     */
    listClassrooms(
      organizationId: string,
    ): Promise<{ classrooms: ClassroomWithDetails[] }> {
      return client.get<{ classrooms: ClassroomWithDetails[] }>(
        `/v1/organizations/${organizationId}/teacher/classrooms`,
      );
    },

    /**
     * GET /v1/teacher/classrooms/:classroomId — Get classroom details.
     */
    getClassroom(
      classroomId: string,
    ): Promise<{ classroom: ClassroomWithDetails }> {
      return client.get<{ classroom: ClassroomWithDetails }>(
        `/v1/teacher/classrooms/${classroomId}`,
      );
    },

    /**
     * PATCH /v1/teacher/classrooms/:classroomId — Update classroom metadata.
     */
    updateClassroom(
      classroomId: string,
      input: UpdateClassroomInput,
    ): Promise<{ classroom: Classroom }> {
      return client.patch<{ classroom: Classroom }>(
        `/v1/teacher/classrooms/${classroomId}`,
        input,
      );
    },

    /**
     * POST /v1/teacher/classrooms/:classroomId/archive — Archive classroom.
     */
    archiveClassroom(
      classroomId: string,
    ): Promise<{ classroom: Classroom }> {
      return client.post<{ classroom: Classroom }>(
        `/v1/teacher/classrooms/${classroomId}/archive`,
      );
    },

    /**
     * DELETE /v1/teacher/classrooms/:classroomId — Hard delete classroom (fails with 409 if exams/attempts exist).
     */
    deleteClassroom(classroomId: string): Promise<void> {
      return client.delete<void>(`/v1/teacher/classrooms/${classroomId}`);
    },

    /**
     * POST /v1/teacher/classrooms/:classroomId/regenerate-invite-code — Generate new invite code.
     */
    regenerateInviteCode(
      classroomId: string,
    ): Promise<{ classroom: Classroom }> {
      return client.post<{ classroom: Classroom }>(
        `/v1/teacher/classrooms/${classroomId}/regenerate-invite-code`,
      );
    },

    /**
     * GET /v1/teacher/classrooms/:classroomId/members — List classroom members.
     */
    listMembers(
      classroomId: string,
    ): Promise<{ members: ClassroomMemberWithUser[] }> {
      return client.get<{ members: ClassroomMemberWithUser[] }>(
        `/v1/teacher/classrooms/${classroomId}/members`,
      );
    },

    /**
     * DELETE /v1/teacher/classrooms/:classroomId/members/:studentId — Remove student member.
     */
    removeMember(
      classroomId: string,
      studentId: string,
    ): Promise<{ member: ClassroomMember }> {
      return client.delete<{ member: ClassroomMember }>(
        `/v1/teacher/classrooms/${classroomId}/members/${studentId}`,
      );
    },

    // -----------------------------------------------------------------------
    // Exams
    // -----------------------------------------------------------------------

    /**
     * POST /v1/teacher/classrooms/:classroomId/exams — Create draft exam under classroom.
     */
    createExam(
      classroomId: string,
      input: CreateExamInput,
    ): Promise<{ exam: TeacherExamWithDetails }> {
      return client.post<{ exam: TeacherExamWithDetails }>(
        `/v1/teacher/classrooms/${classroomId}/exams`,
        input,
      );
    },

    /**
     * GET /v1/teacher/classrooms/:classroomId/exams — List exams in classroom.
     */
    listClassroomExams(
      classroomId: string,
    ): Promise<{ exams: TeacherExamWithDetails[] }> {
      return client.get<{ exams: TeacherExamWithDetails[] }>(
        `/v1/teacher/classrooms/${classroomId}/exams`,
      );
    },

    /**
     * GET /v1/teacher/exams/:examId — Get exam detail.
     */
    getExam(examId: string): Promise<{ exam: TeacherExamWithDetails }> {
      return client.get<{ exam: TeacherExamWithDetails }>(
        `/v1/teacher/exams/${examId}`,
      );
    },

    /**
     * PATCH /v1/teacher/exams/:examId — Update exam settings (draft only).
     */
    updateExam(
      examId: string,
      input: UpdateExamInput,
    ): Promise<{ exam: TeacherExamWithDetails }> {
      return client.patch<{ exam: TeacherExamWithDetails }>(
        `/v1/teacher/exams/${examId}`,
        input,
      );
    },

    /**
     * POST /v1/teacher/exams/:examId/publish — Publish exam (locks questions).
     */
    publishExam(examId: string): Promise<{ exam: TeacherExamWithDetails }> {
      return client.post<{ exam: TeacherExamWithDetails }>(
        `/v1/teacher/exams/${examId}/publish`,
      );
    },

    /**
     * POST /v1/teacher/exams/:examId/unpublish — Return published exam to draft (fails with 409 if attempts exist).
     */
    unpublishExam(examId: string): Promise<{ exam: TeacherExamWithDetails }> {
      return client.post<{ exam: TeacherExamWithDetails }>(
        `/v1/teacher/exams/${examId}/unpublish`,
      );
    },

    /**
     * POST /v1/teacher/exams/:examId/close — Manually close active exam.
     */
    closeExam(examId: string): Promise<{ exam: TeacherExamWithDetails }> {
      return client.post<{ exam: TeacherExamWithDetails }>(
        `/v1/teacher/exams/${examId}/close`,
      );
    },

    /**
     * POST /v1/teacher/exams/:examId/release-results — Release exam results to students.
     */
    releaseResults(examId: string): Promise<{ exam: TeacherExamWithDetails }> {
      return client.post<{ exam: TeacherExamWithDetails }>(
        `/v1/teacher/exams/${examId}/release-results`,
      );
    },

    /**
     * POST /v1/teacher/exams/:examId/archive — Archive exam.
     */
    archiveExam(examId: string): Promise<{ exam: TeacherExamWithDetails }> {
      return client.post<{ exam: TeacherExamWithDetails }>(
        `/v1/teacher/exams/${examId}/archive`,
      );
    },

    // -----------------------------------------------------------------------
    // Questions (Draft Only)
    // -----------------------------------------------------------------------

    /**
     * POST /v1/teacher/exams/:examId/questions — Add question to exam.
     */
    createQuestion(
      examId: string,
      input: TeacherQuestionInput,
    ): Promise<{ question: TeacherExamQuestion }> {
      return client.post<{ question: TeacherExamQuestion }>(
        `/v1/teacher/exams/${examId}/questions`,
        input,
      );
    },

    /**
     * GET /v1/teacher/exams/:examId/questions — List questions for teacher authoring/inspection.
     */
    listQuestions(
      examId: string,
    ): Promise<{ questions: TeacherExamQuestion[] }> {
      return client.get<{ questions: TeacherExamQuestion[] }>(
        `/v1/teacher/exams/${examId}/questions`,
      );
    },

    /**
     * PATCH /v1/teacher/exams/:examId/questions/:questionId — Update question.
     */
    updateQuestion(
      examId: string,
      questionId: string,
      input: TeacherQuestionInput,
    ): Promise<{ question: TeacherExamQuestion }> {
      return client.patch<{ question: TeacherExamQuestion }>(
        `/v1/teacher/exams/${examId}/questions/${questionId}`,
        input,
      );
    },

    /**
     * DELETE /v1/teacher/exams/:examId/questions/:questionId — Delete question.
     */
    deleteQuestion(
      examId: string,
      questionId: string,
    ): Promise<{ success: boolean }> {
      return client.delete<{ success: boolean }>(
        `/v1/teacher/exams/${examId}/questions/${questionId}`,
      );
    },

    /**
     * POST /v1/teacher/exams/:examId/questions/reorder — Reorder questions array.
     */
    reorderQuestions(
      examId: string,
      questionIds: string[],
    ): Promise<{ success: boolean }> {
      return client.post<{ success: boolean }>(
        `/v1/teacher/exams/${examId}/questions/reorder`,
        { questionIds },
      );
    },

    // -----------------------------------------------------------------------
    // Results
    // -----------------------------------------------------------------------

    /**
     * GET /v1/teacher/exams/:examId/results — Aggregate results for teacher view.
     */
    getExamResults(
      examId: string,
    ): Promise<{ results: TeacherExamResultsAggregateDTO }> {
      return client.get<{ results: TeacherExamResultsAggregateDTO }>(
        `/v1/teacher/exams/${examId}/results`,
      );
    },

    /**
     * GET /v1/teacher/exams/:examId/results/:studentId — Individual student attempt review.
     */
    getStudentResult(
      examId: string,
      studentId: string,
    ): Promise<{
      result: StudentExamResultForTeacherDTO;
      detail?: StudentExamResultForTeacherDTO;
    }> {
      return client.get<{
        result: StudentExamResultForTeacherDTO;
        detail?: StudentExamResultForTeacherDTO;
      }>(`/v1/teacher/exams/${examId}/results/${studentId}`);
    },

    /**
     * PUT /v1/teacher/exams/:examId/attempts/:attemptId/answers/:questionId/grade — Grade a descriptive answer manually.
     */
    gradeDescriptiveAnswer(
      examId: string,
      attemptId: string,
      questionId: string,
      input: GradeDescriptiveAnswerInput,
    ): Promise<{
      attempt: TeacherExamAttempt;
      answer: TeacherExamAttemptAnswer;
    }> {
      return client.put<{
        attempt: TeacherExamAttempt;
        answer: TeacherExamAttemptAnswer;
      }>(
        `/v1/teacher/exams/${examId}/attempts/${attemptId}/answers/${questionId}/grade`,
        input,
      );
    },

    // -----------------------------------------------------------------------
    // Assignments
    // -----------------------------------------------------------------------

    /**
     * POST /v1/teacher/classrooms/:classroomId/assignments — Create assignment
     */
    createAssignment(
      classroomId: string,
      data: {
        title: string;
        description?: string | null;
        startsAt: string;
        dueAt: string;
        status?: "draft" | "published";
      },
    ): Promise<{ assignment: ClassroomAssignment }> {
      return client.post<{ assignment: ClassroomAssignment }>(
        `/v1/teacher/classrooms/${classroomId}/assignments`,
        data,
      );
    },

    /**
     * GET /v1/teacher/classrooms/:classroomId/assignments — List assignments
     */
    getClassroomAssignments(
      classroomId: string,
    ): Promise<{ assignments: TeacherAssignmentListItemDTO[] }> {
      return client.get<{ assignments: TeacherAssignmentListItemDTO[] }>(
        `/v1/teacher/classrooms/${classroomId}/assignments`,
      );
    },

    /**
     * GET /v1/teacher/assignments/:assignmentId — Get assignment details
     */
    getAssignment(
      assignmentId: string,
    ): Promise<{
      assignment: ClassroomAssignment;
      submissionsCount: number;
      totalMembersCount: number;
    }> {
      return client.get<{
        assignment: ClassroomAssignment;
        submissionsCount: number;
        totalMembersCount: number;
      }>(`/v1/teacher/assignments/${assignmentId}`);
    },

    /**
     * PATCH /v1/teacher/assignments/:assignmentId — Update assignment
     */
    updateAssignment(
      assignmentId: string,
      data: {
        title?: string;
        description?: string | null;
        startsAt?: string;
        dueAt?: string;
        status?: "draft" | "published" | "archived";
      },
    ): Promise<{ assignment: ClassroomAssignment }> {
      return client.patch<{ assignment: ClassroomAssignment }>(
        `/v1/teacher/assignments/${assignmentId}`,
        data,
      );
    },

    /**
     * POST /v1/teacher/assignments/:assignmentId/publish — Publish assignment
     */
    publishAssignment(
      assignmentId: string,
    ): Promise<{ assignment: ClassroomAssignment }> {
      return client.post<{ assignment: ClassroomAssignment }>(
        `/v1/teacher/assignments/${assignmentId}/publish`,
      );
    },

    /**
     * POST /v1/teacher/assignments/:assignmentId/unpublish — Unpublish assignment
     */
    unpublishAssignment(
      assignmentId: string,
    ): Promise<{ assignment: ClassroomAssignment }> {
      return client.post<{ assignment: ClassroomAssignment }>(
        `/v1/teacher/assignments/${assignmentId}/unpublish`,
      );
    },

    /**
     * POST /v1/teacher/assignments/:assignmentId/archive — Archive assignment
     */
    archiveAssignment(
      assignmentId: string,
    ): Promise<{ assignment: ClassroomAssignment }> {
      return client.post<{ assignment: ClassroomAssignment }>(
        `/v1/teacher/assignments/${assignmentId}/archive`,
      );
    },

    /**
     * DELETE /v1/teacher/assignments/:assignmentId — Delete assignment
     */
    deleteAssignment(assignmentId: string): Promise<void> {
      return client.delete<void>(`/v1/teacher/assignments/${assignmentId}`);
    },

    /**
     * GET /v1/teacher/assignments/:assignmentId/submissions — List student submissions
     */
    getAssignmentSubmissions(
      assignmentId: string,
    ): Promise<TeacherAssignmentSubmissionsListDTO> {
      return client.get<TeacherAssignmentSubmissionsListDTO>(
        `/v1/teacher/assignments/${assignmentId}/submissions`,
      );
    },
  };
}

export interface TeacherAssignmentListItemDTO {
  id: string;
  classroomId: string;
  teacherId: string;
  title: string;
  description: string | null;
  startsAt: string;
  dueAt: string;
  status: "draft" | "published" | "archived";
  submissionsCount: number;
  totalMembersCount: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface StudentSubmissionDetailItem {
  studentId: string;
  studentName: string;
  studentEmail: string;
  submitted: boolean;
  submission: {
    id: string;
    answerText: string;
    submittedAt: string;
  } | null;
}

export interface TeacherAssignmentSubmissionsListDTO {
  assignment: ClassroomAssignment;
  submissions: StudentSubmissionDetailItem[];
  stats: {
    submittedCount: number;
    totalStudentsCount: number;
  };
}

export type TeacherApi = ReturnType<typeof createTeacherApi>;
