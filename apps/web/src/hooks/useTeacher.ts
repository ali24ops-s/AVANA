/**
 * TanStack Query hooks for the AVANA Teacher Platform.
 *
 * Implements typed queries, mutations, and cache invalidation patterns
 * adhering to the frozen Phase 2 backend contracts.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createTeacherApi,
  type ClassroomWithDetails,
  type ClassroomMemberWithUser,
  type TeacherExamWithDetails,
  type TeacherExamResultsAggregateDTO,
  type StudentExamResultForTeacherDTO,
} from "../lib/api/teacher.js";
import type {
  Classroom,
  ClassroomMember,
  TeacherExamQuestion,
  TeacherExamAttempt,
  TeacherExamAttemptAnswer,
  CreateClassroomInput,
  CreateExamInput,
  UpdateClassroomInput,
  UpdateExamInput,
  TeacherQuestionInput,
  GradeDescriptiveAnswerInput,
} from "@avana/domain";

function getTeacherApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createTeacherApi(client);
}

// ---------------------------------------------------------------------------
// Query Keys Factory
// ---------------------------------------------------------------------------

export const teacherQueryKeys = {
  classrooms: (organizationId: string) => ["teacher-classrooms", organizationId] as const,
  classroom: (classroomId: string) => ["teacher-classroom", classroomId] as const,
  classroomMembers: (classroomId: string) => ["teacher-classroom-members", classroomId] as const,
  classroomExams: (classroomId: string) => ["teacher-classroom-exams", classroomId] as const,
  exam: (examId: string) => ["teacher-exam", examId] as const,
  examQuestions: (examId: string) => ["teacher-exam-questions", examId] as const,
  examResults: (examId: string) => ["teacher-exam-results", examId] as const,
  studentResult: (examId: string, studentId: string) =>
    ["teacher-student-result", examId, studentId] as const,
};

// ---------------------------------------------------------------------------
// Classrooms Hooks
// ---------------------------------------------------------------------------

export function useTeacherClassrooms(organizationId?: string) {
  const api = getTeacherApi();
  return useQuery<{ classrooms: ClassroomWithDetails[] }>({
    queryKey: organizationId ? teacherQueryKeys.classrooms(organizationId) : ["teacher-classrooms"],
    queryFn: () => {
      if (!organizationId) throw new Error("Organization ID is required");
      return api.listClassrooms(organizationId);
    },
    enabled: Boolean(organizationId && organizationId.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useTeacherClassroom(classroomId?: string) {
  const api = getTeacherApi();
  return useQuery<{ classroom: ClassroomWithDetails }>({
    queryKey: classroomId ? teacherQueryKeys.classroom(classroomId) : ["teacher-classroom"],
    queryFn: () => {
      if (!classroomId) throw new Error("Classroom ID is required");
      return api.getClassroom(classroomId);
    },
    enabled: Boolean(classroomId && classroomId.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useCreateClassroom(organizationId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ classroom: Classroom }, Error, Omit<CreateClassroomInput, "organizationId">>({
    mutationFn: (input) => api.createClassroom(organizationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.classrooms(organizationId),
      });
    },
  });
}

export function useUpdateClassroom(classroomId: string, organizationId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ classroom: Classroom }, Error, UpdateClassroomInput>({
    mutationFn: (input) => api.updateClassroom(classroomId, input),
    onSuccess: (data) => {
      queryClient.setQueryData(teacherQueryKeys.classroom(classroomId), (old: { classroom: ClassroomWithDetails } | undefined) => {
        if (!old) return { classroom: { ...data.classroom, membersCount: 0, examsCount: 0 } };
        return { classroom: { ...old.classroom, ...data.classroom } };
      });
      if (organizationId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classrooms(organizationId),
        });
      }
    },
  });
}

export function useArchiveClassroom(classroomId: string, organizationId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ classroom: Classroom }, Error, void>({
    mutationFn: () => api.archiveClassroom(classroomId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.classroom(classroomId),
      });
      if (organizationId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classrooms(organizationId),
        });
      }
    },
  });
}

export function useDeleteClassroom(organizationId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<void, Error, string>({
    mutationFn: (classroomId) => api.deleteClassroom(classroomId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.classrooms(organizationId),
      });
    },
  });
}

export function useRegenerateInviteCode(classroomId: string, organizationId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ classroom: Classroom }, Error, void>({
    mutationFn: () => api.regenerateInviteCode(classroomId),
    onSuccess: (data) => {
      queryClient.setQueryData(teacherQueryKeys.classroom(classroomId), (old: { classroom: ClassroomWithDetails } | undefined) => {
        if (!old) return undefined;
        return { classroom: { ...old.classroom, inviteCode: data.classroom.inviteCode } };
      });
      if (organizationId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classrooms(organizationId),
        });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Members Hooks
// ---------------------------------------------------------------------------

export function useClassroomMembers(classroomId?: string) {
  const api = getTeacherApi();
  return useQuery<{ members: ClassroomMemberWithUser[] }>({
    queryKey: classroomId ? teacherQueryKeys.classroomMembers(classroomId) : ["teacher-classroom-members"],
    queryFn: () => {
      if (!classroomId) throw new Error("Classroom ID is required");
      return api.listMembers(classroomId);
    },
    enabled: Boolean(classroomId && classroomId.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useRemoveClassroomMember(classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ member: ClassroomMember }, Error, string>({
    mutationFn: (studentId) => api.removeMember(classroomId, studentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.classroomMembers(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.classroom(classroomId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Exams Hooks
// ---------------------------------------------------------------------------

export function useClassroomExams(classroomId?: string) {
  const api = getTeacherApi();
  return useQuery<{ exams: TeacherExamWithDetails[] }>({
    queryKey: classroomId ? teacherQueryKeys.classroomExams(classroomId) : ["teacher-classroom-exams"],
    queryFn: () => {
      if (!classroomId) throw new Error("Classroom ID is required");
      return api.listClassroomExams(classroomId);
    },
    enabled: Boolean(classroomId && classroomId.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useCreateExam(classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ exam: TeacherExamWithDetails }, Error, CreateExamInput>({
    mutationFn: (input) => api.createExam(classroomId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.classroomExams(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.classroom(classroomId),
      });
    },
  });
}

export function useTeacherExam(examId?: string) {
  const api = getTeacherApi();
  return useQuery<{ exam: TeacherExamWithDetails }>({
    queryKey: examId ? teacherQueryKeys.exam(examId) : ["teacher-exam"],
    queryFn: () => {
      if (!examId) throw new Error("Exam ID is required");
      return api.getExam(examId);
    },
    enabled: Boolean(examId && examId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useUpdateExam(examId: string, classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ exam: TeacherExamWithDetails }, Error, UpdateExamInput>({
    mutationFn: (input) => api.updateExam(examId, input),
    onSuccess: (data) => {
      queryClient.setQueryData(teacherQueryKeys.exam(examId), data);
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classroomExams(classroomId),
        });
      }
    },
  });
}

export function usePublishExam(examId: string, classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ exam: TeacherExamWithDetails }, Error, void>({
    mutationFn: () => api.publishExam(examId),
    onSuccess: (data) => {
      queryClient.setQueryData(teacherQueryKeys.exam(examId), data);
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classroomExams(classroomId),
        });
      }
    },
  });
}

export function useUnpublishExam(examId: string, classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ exam: TeacherExamWithDetails }, Error, void>({
    mutationFn: () => api.unpublishExam(examId),
    onSuccess: (data) => {
      queryClient.setQueryData(teacherQueryKeys.exam(examId), data);
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classroomExams(classroomId),
        });
      }
    },
  });
}

export function useCloseExam(examId: string, classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ exam: TeacherExamWithDetails }, Error, void>({
    mutationFn: () => api.closeExam(examId),
    onSuccess: (data) => {
      queryClient.setQueryData(teacherQueryKeys.exam(examId), data);
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classroomExams(classroomId),
        });
      }
    },
  });
}

export function useReleaseExamResults(examId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ exam: TeacherExamWithDetails }, Error, void>({
    mutationFn: () => api.releaseResults(examId),
    onSuccess: (data) => {
      queryClient.setQueryData(teacherQueryKeys.exam(examId), data);
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.examResults(examId),
      });
    },
  });
}

export function useArchiveExam(examId: string, classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ exam: TeacherExamWithDetails }, Error, void>({
    mutationFn: () => api.archiveExam(examId),
    onSuccess: (data) => {
      queryClient.setQueryData(teacherQueryKeys.exam(examId), data);
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classroomExams(classroomId),
        });
      }
    },
  });
}

export function useDeleteExam(classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<void, Error, string>({
    mutationFn: (examId: string) => api.deleteExam(examId),
    onSuccess: (_data, examId) => {
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classroomExams(classroomId),
        });
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.classroom(classroomId),
        });
      }
      queryClient.removeQueries({
        queryKey: teacherQueryKeys.exam(examId),
      });
      queryClient.removeQueries({
        queryKey: teacherQueryKeys.examQuestions(examId),
      });
      queryClient.removeQueries({
        queryKey: teacherQueryKeys.examResults(examId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Questions Hooks
// ---------------------------------------------------------------------------

export function useExamQuestions(examId?: string) {
  const api = getTeacherApi();
  return useQuery<{ questions: TeacherExamQuestion[] }>({
    queryKey: examId ? teacherQueryKeys.examQuestions(examId) : ["teacher-exam-questions"],
    queryFn: () => {
      if (!examId) throw new Error("Exam ID is required");
      return api.listQuestions(examId);
    },
    enabled: Boolean(examId && examId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useCreateQuestion(examId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ question: TeacherExamQuestion }, Error, TeacherQuestionInput>({
    mutationFn: (input) => api.createQuestion(examId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.examQuestions(examId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.exam(examId),
      });
    },
  });
}

export function useUpdateQuestion(examId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<
    { question: TeacherExamQuestion },
    Error,
    { questionId: string; input: TeacherQuestionInput }
  >({
    mutationFn: ({ questionId, input }) => api.updateQuestion(examId, questionId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.examQuestions(examId),
      });
    },
  });
}

export function useDeleteQuestion(examId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (questionId) => api.deleteQuestion(examId, questionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.examQuestions(examId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.exam(examId),
      });
    },
  });
}

export function useReorderQuestions(examId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ success: boolean }, Error, string[]>({
    mutationFn: (questionIds) => api.reorderQuestions(examId, questionIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.examQuestions(examId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Results Hooks
// ---------------------------------------------------------------------------

export function useExamResults(examId?: string) {
  const api = getTeacherApi();
  return useQuery<{ results: TeacherExamResultsAggregateDTO }>({
    queryKey: examId ? teacherQueryKeys.examResults(examId) : ["teacher-exam-results"],
    queryFn: () => {
      if (!examId) throw new Error("Exam ID is required");
      return api.getExamResults(examId);
    },
    enabled: Boolean(examId && examId.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useStudentExamResult(examId?: string, studentId?: string) {
  const api = getTeacherApi();
  return useQuery<{
    result: StudentExamResultForTeacherDTO;
    detail?: StudentExamResultForTeacherDTO;
  }>({
    queryKey: examId && studentId ? teacherQueryKeys.studentResult(examId, studentId) : ["teacher-student-result"],
    queryFn: () => {
      if (!examId || !studentId) throw new Error("Exam ID and Student ID are required");
      return api.getStudentResult(examId, studentId);
    },
    enabled: Boolean(examId && studentId),
    staleTime: 60_000,
  });
}

export function useGradeDescriptiveAnswer(examId: string, studentId?: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<
    { attempt: TeacherExamAttempt; answer: TeacherExamAttemptAnswer },
    Error,
    {
      attemptId: string;
      questionId: string;
      input: GradeDescriptiveAnswerInput;
    }
  >({
    mutationFn: ({ attemptId, questionId, input }) =>
      api.gradeDescriptiveAnswer(examId, attemptId, questionId, input),
    onSuccess: () => {
      if (studentId) {
        void queryClient.invalidateQueries({
          queryKey: teacherQueryKeys.studentResult(examId, studentId),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.examResults(examId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherQueryKeys.exam(examId),
      });
    },
  });
}
