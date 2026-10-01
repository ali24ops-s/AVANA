import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createTeacherApi,
  type TeacherAssignmentListItemDTO,
  type TeacherAssignmentSubmissionsListDTO,
} from "../lib/api/teacher.js";
import type { ClassroomAssignment } from "@avana/domain";

function getTeacherApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createTeacherApi(client);
}

export const teacherAssignmentQueryKeys = {
  all: ["teacher-assignments"] as const,
  classroomAssignments: (classroomId: string) =>
    ["teacher-classroom-assignments", classroomId] as const,
  assignment: (assignmentId: string) =>
    ["teacher-assignment", assignmentId] as const,
  submissions: (assignmentId: string) =>
    ["teacher-assignment-submissions", assignmentId] as const,
};

export function useTeacherClassroomAssignments(classroomId?: string) {
  const api = getTeacherApi();
  return useQuery<{ assignments: TeacherAssignmentListItemDTO[] }>({
    queryKey: classroomId
      ? teacherAssignmentQueryKeys.classroomAssignments(classroomId)
      : ["teacher-classroom-assignments"],
    queryFn: () => {
      if (!classroomId) throw new Error("Classroom ID is required");
      return api.getClassroomAssignments(classroomId);
    },
    enabled: Boolean(classroomId && classroomId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useTeacherAssignment(assignmentId?: string) {
  const api = getTeacherApi();
  return useQuery<{
    assignment: ClassroomAssignment;
    submissionsCount: number;
    totalMembersCount: number;
  }>({
    queryKey: assignmentId
      ? teacherAssignmentQueryKeys.assignment(assignmentId)
      : ["teacher-assignment"],
    queryFn: () => {
      if (!assignmentId) throw new Error("Assignment ID is required");
      return api.getAssignment(assignmentId);
    },
    enabled: Boolean(assignmentId && assignmentId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useTeacherAssignmentSubmissions(assignmentId?: string) {
  const api = getTeacherApi();
  return useQuery<TeacherAssignmentSubmissionsListDTO>({
    queryKey: assignmentId
      ? teacherAssignmentQueryKeys.submissions(assignmentId)
      : ["teacher-assignment-submissions"],
    queryFn: () => {
      if (!assignmentId) throw new Error("Assignment ID is required");
      return api.getAssignmentSubmissions(assignmentId);
    },
    enabled: Boolean(assignmentId && assignmentId.trim().length > 0),
    staleTime: 10_000,
  });
}

export function useCreateAssignment(classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<
    { assignment: ClassroomAssignment },
    Error,
    {
      title: string;
      description?: string | null;
      startsAt: string;
      dueAt: string;
      status?: "draft" | "published";
    }
  >({
    mutationFn: (input) => api.createAssignment(classroomId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.classroomAssignments(classroomId),
      });
    },
  });
}

export function useUpdateAssignment(assignmentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<
    { assignment: ClassroomAssignment },
    Error,
    {
      title?: string;
      description?: string | null;
      startsAt?: string;
      dueAt?: string;
      status?: "draft" | "published" | "archived";
    }
  >({
    mutationFn: (input) => api.updateAssignment(assignmentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.classroomAssignments(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.assignment(assignmentId),
      });
    },
  });
}

export function usePublishAssignment(assignmentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ assignment: ClassroomAssignment }, Error, void>({
    mutationFn: () => api.publishAssignment(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.classroomAssignments(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.assignment(assignmentId),
      });
    },
  });
}

export function useUnpublishAssignment(assignmentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ assignment: ClassroomAssignment }, Error, void>({
    mutationFn: () => api.unpublishAssignment(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.classroomAssignments(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.assignment(assignmentId),
      });
    },
  });
}

export function useArchiveAssignment(assignmentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ assignment: ClassroomAssignment }, Error, void>({
    mutationFn: () => api.archiveAssignment(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.classroomAssignments(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.assignment(assignmentId),
      });
    },
  });
}

export function useDeleteAssignment(assignmentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<void, Error, void>({
    mutationFn: () => api.deleteAssignment(assignmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherAssignmentQueryKeys.classroomAssignments(classroomId),
      });
    },
  });
}
