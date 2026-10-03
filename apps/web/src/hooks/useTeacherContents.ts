import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createTeacherApi } from "../lib/api/teacher.js";
import type {
  ClassroomContent,
  CreateClassroomContentInput,
  UpdateClassroomContentInput,
} from "@avana/domain";

function getTeacherApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createTeacherApi(client);
}

export const teacherContentQueryKeys = {
  all: ["teacher-contents"] as const,
  classroomContents: (classroomId: string) =>
    ["teacher-classroom-contents", classroomId] as const,
  content: (contentId: string) => ["teacher-content", contentId] as const,
};

export function useTeacherClassroomContents(classroomId?: string) {
  const api = getTeacherApi();
  return useQuery<{ contents: ClassroomContent[] }>({
    queryKey: classroomId
      ? teacherContentQueryKeys.classroomContents(classroomId)
      : ["teacher-classroom-contents"],
    queryFn: () => {
      if (!classroomId) throw new Error("Classroom ID is required");
      return api.listContents(classroomId);
    },
    enabled: Boolean(classroomId && classroomId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useTeacherContent(contentId?: string) {
  const api = getTeacherApi();
  return useQuery<{ content: ClassroomContent }>({
    queryKey: contentId
      ? teacherContentQueryKeys.content(contentId)
      : ["teacher-content"],
    queryFn: () => {
      if (!contentId) throw new Error("Content ID is required");
      return api.getContent(contentId);
    },
    enabled: Boolean(contentId && contentId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useCreateClassroomContent(classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<
    { content: ClassroomContent },
    Error,
    CreateClassroomContentInput
  >({
    mutationFn: (input) => api.createContent(classroomId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.classroomContents(classroomId),
      });
    },
  });
}

export function useUpdateClassroomContent(contentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<
    { content: ClassroomContent },
    Error,
    UpdateClassroomContentInput
  >({
    mutationFn: (input) => api.updateContent(contentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.classroomContents(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.content(contentId),
      });
    },
  });
}

export function usePublishClassroomContent(contentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ content: ClassroomContent }, Error, void>({
    mutationFn: () => api.publishContent(contentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.classroomContents(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.content(contentId),
      });
    },
  });
}

export function useUnpublishClassroomContent(contentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ content: ClassroomContent }, Error, void>({
    mutationFn: () => api.unpublishContent(contentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.classroomContents(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.content(contentId),
      });
    },
  });
}

export function useArchiveClassroomContent(contentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<{ content: ClassroomContent }, Error, void>({
    mutationFn: () => api.archiveContent(contentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.classroomContents(classroomId),
      });
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.content(contentId),
      });
    },
  });
}

export function useDeleteClassroomContent(contentId: string, classroomId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<void, Error, void>({
    mutationFn: () => api.deleteContent(contentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherContentQueryKeys.classroomContents(classroomId),
      });
    },
  });
}
