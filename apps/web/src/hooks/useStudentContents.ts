import { useQuery } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createStudentPlatformApi } from "../lib/api/student-platform.js";
import type { ClassroomContent } from "@avana/domain";

function getStudentApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createStudentPlatformApi(client);
}

export const studentContentQueryKeys = {
  all: ["student-contents"] as const,
  classroomContents: (classroomId: string) =>
    ["student-classroom-contents", classroomId] as const,
  contentDetails: (contentId: string) =>
    ["student-content-detail", contentId] as const,
};

export function useStudentClassroomContents(classroomId?: string) {
  const api = getStudentApi();
  return useQuery<{ contents: ClassroomContent[] }>({
    queryKey: classroomId
      ? studentContentQueryKeys.classroomContents(classroomId)
      : ["student-classroom-contents"],
    queryFn: () => {
      if (!classroomId) throw new Error("Classroom ID is required");
      return api.listClassroomContents(classroomId);
    },
    enabled: Boolean(classroomId && classroomId.trim().length > 0),
    staleTime: 15_000,
  });
}

export function useStudentContentDetails(contentId?: string) {
  const api = getStudentApi();
  return useQuery<{ content: ClassroomContent }>({
    queryKey: contentId
      ? studentContentQueryKeys.contentDetails(contentId)
      : ["student-content-detail"],
    queryFn: () => {
      if (!contentId) throw new Error("Content ID is required");
      return api.getContentDetails(contentId);
    },
    enabled: Boolean(contentId && contentId.trim().length > 0),
    staleTime: 15_000,
  });
}
