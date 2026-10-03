import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createTeacherApi } from "../lib/api/teacher.js";
import type {
  TeacherConversation,
  TeacherConversationMessage,
  TeacherConversationWithDetails,
  TeacherMessageCategory,
  TeacherMessageStatus,
} from "@avana/domain";

function getTeacherApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createTeacherApi(client);
}

export const teacherMessageQueryKeys = {
  all: ["teacher-conversations"] as const,
  list: (filter?: {
    classroomId?: string;
    status?: TeacherMessageStatus;
    category?: TeacherMessageCategory;
    limit?: number;
    offset?: number;
  }) => ["teacher-conversations", filter] as const,
  detail: (conversationId: string) =>
    ["teacher-conversation", conversationId] as const,
};

export function useTeacherConversations(filter?: {
  classroomId?: string;
  status?: TeacherMessageStatus;
  category?: TeacherMessageCategory;
  limit?: number;
  offset?: number;
}) {
  const api = getTeacherApi();
  return useQuery<{
    conversations: TeacherConversationWithDetails[];
    total: number;
  }>({
    queryKey: teacherMessageQueryKeys.list(filter),
    queryFn: () => api.listConversations(filter),
    staleTime: 10_000,
  });
}

export function useTeacherConversation(conversationId?: string) {
  const api = getTeacherApi();
  return useQuery<{
    conversation: TeacherConversationWithDetails;
    messages: TeacherConversationMessage[];
  }>({
    queryKey: conversationId
      ? teacherMessageQueryKeys.detail(conversationId)
      : ["teacher-conversation"],
    queryFn: () => {
      if (!conversationId) throw new Error("Conversation ID is required");
      return api.getConversation(conversationId);
    },
    enabled: Boolean(conversationId && conversationId.trim().length > 0),
    staleTime: 10_000,
  });
}

export function useTeacherReplyMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<
    { message: TeacherConversationMessage; conversation: TeacherConversation },
    Error,
    { body: string }
  >({
    mutationFn: (input) => api.replyToConversation(conversationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherMessageQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: teacherMessageQueryKeys.detail(conversationId),
      });
    },
  });
}

export function useTeacherUpdateConversationStatus(conversationId: string) {
  const queryClient = useQueryClient();
  const api = getTeacherApi();

  return useMutation<
    { conversation: TeacherConversation },
    Error,
    { status: TeacherMessageStatus }
  >({
    mutationFn: (input) => api.updateConversationStatus(conversationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: teacherMessageQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: teacherMessageQueryKeys.detail(conversationId),
      });
    },
  });
}
