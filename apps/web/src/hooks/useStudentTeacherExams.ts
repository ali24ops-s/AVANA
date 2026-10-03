/**
 * TanStack Query hooks for the AVANA Student Teacher Platform integration.
 *
 * Implements typed queries, mutations, and cache invalidation patterns
 * strictly adhering to backend contracts.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createStudentPlatformApi,
  type StudentClassroomDTO,
  type JoinClassroomResponse,
  type StudentExamListDTO,
  type StudentAttemptDTO,
  type StudentAttemptResultDTO,
  type StudentReviewDTO,
} from "../lib/api/student-platform.js";
import type { ClassroomMember, DescriptiveAnswerIntegrityData } from "@avana/domain";

function getStudentPlatformApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createStudentPlatformApi(client);
}

// ---------------------------------------------------------------------------
// Query Keys Factory
// ---------------------------------------------------------------------------

export const studentExamKeys = {
  classrooms: () => ["student-classrooms"] as const,
  classroomExams: (classroomId: string) => ["student-classroom-exams", classroomId] as const,
  allExams: () => ["student-all-exams"] as const,
  currentAttempt: (examId: string) => ["student-exam-attempt", examId] as const,
  review: (examId: string) => ["student-exam-review", examId] as const,
};

// ---------------------------------------------------------------------------
// Classrooms Hooks
// ---------------------------------------------------------------------------

export function useStudentClassrooms() {
  const api = getStudentPlatformApi();
  return useQuery<{ classrooms: StudentClassroomDTO[] }>({
    queryKey: studentExamKeys.classrooms(),
    queryFn: () => api.listClassrooms(),
    staleTime: 30_000,
  });
}

export function useJoinClassroom() {
  const queryClient = useQueryClient();
  const api = getStudentPlatformApi();

  return useMutation<JoinClassroomResponse, Error, string>({
    mutationFn: (inviteCode: string) => api.joinClassroom(inviteCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.classrooms() });
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.allExams() });
    },
  });
}

export function useLeaveClassroom() {
  const queryClient = useQueryClient();
  const api = getStudentPlatformApi();

  return useMutation<{ member: ClassroomMember }, Error, string>({
    mutationFn: (classroomId: string) => api.leaveClassroom(classroomId),
    onSuccess: (_data, classroomId) => {
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.classrooms() });
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.classroomExams(classroomId) });
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.allExams() });
    },
  });
}

// ---------------------------------------------------------------------------
// Exam Listing Hooks
// ---------------------------------------------------------------------------

export function useStudentClassroomExams(classroomId?: string) {
  const api = getStudentPlatformApi();
  return useQuery<{ exams: StudentExamListDTO[] }>({
    queryKey: classroomId
      ? studentExamKeys.classroomExams(classroomId)
      : ["student-classroom-exams"],
    queryFn: () => {
      if (!classroomId) throw new Error("شناسه کلاس الزامی است");
      return api.listClassroomExams(classroomId);
    },
    enabled: Boolean(classroomId && classroomId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useAllStudentExams() {
  const api = getStudentPlatformApi();
  return useQuery<{ exams: StudentExamListDTO[] }>({
    queryKey: studentExamKeys.allExams(),
    queryFn: () => api.listAllStudentExams(),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Attempt & Review Hooks
// ---------------------------------------------------------------------------

export function useCurrentStudentExamAttempt(examId?: string) {
  const api = getStudentPlatformApi();
  return useQuery<{ attempt: StudentAttemptDTO | null }>({
    queryKey: examId ? studentExamKeys.currentAttempt(examId) : ["student-exam-attempt"],
    queryFn: () => {
      if (!examId) throw new Error("شناسه آزمون الزامی است");
      return api.getCurrentAttempt(examId);
    },
    enabled: Boolean(examId && examId.trim().length > 0),
    staleTime: 10_000,
  });
}

export function useStartStudentExamAttempt(examId: string, classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getStudentPlatformApi();

  return useMutation<{ attempt: StudentAttemptDTO }, Error, void>({
    mutationFn: () => api.startExam(examId),
    onSuccess: (data) => {
      queryClient.setQueryData(studentExamKeys.currentAttempt(examId), {
        attempt: data.attempt,
      });
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.allExams() });
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: studentExamKeys.classroomExams(classroomId),
        });
      }
    },
  });
}

export function useSaveStudentExamAnswer(examId: string) {
  const api = getStudentPlatformApi();

  return useMutation<
    { success: boolean },
    Error,
    {
      questionId: string;
      selectedOptionId?: string | null;
      textAnswer?: string | null;
      finalized?: boolean;
      activeDurationMs?: number | null;
      tabSwitchesCount?: number | null;
      integrityData?: DescriptiveAnswerIntegrityData | null;
      booleanAnswers?: Record<string, boolean> | null;
    }
  >({
    mutationFn: ({
      questionId,
      selectedOptionId,
      textAnswer,
      finalized,
      activeDurationMs,
      tabSwitchesCount,
      integrityData,
      booleanAnswers,
    }) =>
      api.saveAnswer(
        examId,
        questionId,
        selectedOptionId,
        textAnswer,
        finalized,
        activeDurationMs,
        tabSwitchesCount,
        integrityData,
        booleanAnswers,
      ),
  });
}

export function useSubmitStudentExamAttempt(examId: string, classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getStudentPlatformApi();

  return useMutation<{ result: StudentAttemptResultDTO }, Error, void>({
    mutationFn: () => api.submitExam(examId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.currentAttempt(examId) });
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.review(examId) });
      void queryClient.invalidateQueries({ queryKey: studentExamKeys.allExams() });
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: studentExamKeys.classroomExams(classroomId),
        });
      }
    },
  });
}

export function useStudentExamReview(examId?: string) {
  const api = getStudentPlatformApi();
  return useQuery<{ review: StudentReviewDTO }>({
    queryKey: examId ? studentExamKeys.review(examId) : ["student-exam-review"],
    queryFn: () => {
      if (!examId) throw new Error("شناسه آزمون الزامی است");
      return api.getReview(examId);
    },
    enabled: Boolean(examId && examId.trim().length > 0),
    staleTime: 30_000,
  });
}
