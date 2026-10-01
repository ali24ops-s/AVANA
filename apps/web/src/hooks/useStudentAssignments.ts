import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createStudentPlatformApi,
  type StudentAssignmentListItemDTO,
  type StudentAssignmentDetailDTO,
} from "../lib/api/student-platform.js";
import type { AssignmentSubmission } from "@avana/domain";

function getStudentApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createStudentPlatformApi(client);
}

export const studentAssignmentQueryKeys = {
  all: ["student-assignments"] as const,
  classroomAssignments: (classroomId: string) =>
    ["student-classroom-assignments", classroomId] as const,
  assignment: (assignmentId: string) =>
    ["student-assignment", assignmentId] as const,
};

export function useStudentClassroomAssignments(classroomId?: string) {
  const api = getStudentApi();
  return useQuery<{ assignments: StudentAssignmentListItemDTO[] }>({
    queryKey: classroomId
      ? studentAssignmentQueryKeys.classroomAssignments(classroomId)
      : ["student-classroom-assignments"],
    queryFn: () => {
      if (!classroomId) throw new Error("Classroom ID is required");
      return api.getClassroomAssignments(classroomId);
    },
    enabled: Boolean(classroomId && classroomId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useStudentAssignment(assignmentId?: string) {
  const api = getStudentApi();
  return useQuery<StudentAssignmentDetailDTO>({
    queryKey: assignmentId
      ? studentAssignmentQueryKeys.assignment(assignmentId)
      : ["student-assignment"],
    queryFn: () => {
      if (!assignmentId) throw new Error("Assignment ID is required");
      return api.getAssignment(assignmentId);
    },
    enabled: Boolean(assignmentId && assignmentId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useSubmitAssignment(assignmentId: string, classroomId?: string) {
  const queryClient = useQueryClient();
  const api = getStudentApi();

  return useMutation<
    { submission: AssignmentSubmission },
    Error,
    { answerText: string }
  >({
    mutationFn: (input) => api.submitAssignment(assignmentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studentAssignmentQueryKeys.assignment(assignmentId),
      });
      if (classroomId) {
        void queryClient.invalidateQueries({
          queryKey: studentAssignmentQueryKeys.classroomAssignments(classroomId),
        });
      }
    },
  });
}
