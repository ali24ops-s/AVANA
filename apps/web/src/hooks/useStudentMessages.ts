import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createStudentPlatformApi } from "../lib/api/student-platform.js";
import type {
  TeacherConversation,
  TeacherConversationMessage,
  TeacherConversationWithDetails,
  TeacherMessageCategory,
  TeacherMessageStatus,
} from "@avana/domain";

function getStudentApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createStudentPlatformApi(client);
}

export const studentMessageQueryKeys = {
  all: ["student-conversations"] as const,
  list: (filter?: {
    classroomId?: string;
    status?: TeacherMessageStatus;
    category?: TeacherMessageCategory;
    limit?: number;
    offset?: number;
  }) => ["student-conversations", filter] as const,
  detail: (conversationId: string) =>
    ["student-conversation", conversationId] as const,
};

export function useStudentConversations(filter?: {
  classroomId?: string;
  status?: TeacherMessageStatus;
  category?: TeacherMessageCategory;
  limit?: number;
  offset?: number;
}) {
  const api = getStudentApi();
  return useQuery<{
    conversations: TeacherConversationWithDetails[];
    total: number;
  }>({
    queryKey: studentMessageQueryKeys.list(filter),
    queryFn: () => api.listConversations(filter),
    staleTime: 10_000,
  });
}

export function useStudentConversation(conversationId?: string) {
  const api = getStudentApi();
  return useQuery<{
    conversation: TeacherConversationWithDetails;
    messages: TeacherConversationMessage[];
  }>({
    queryKey: conversationId
      ? studentMessageQueryKeys.detail(conversationId)
      : ["student-conversation"],
    queryFn: () => {
      if (!conversationId) throw new Error("Conversation ID is required");
      return api.getConversation(conversationId);
    },
    enabled: Boolean(conversationId && conversationId.trim().length > 0),
    staleTime: 10_000,
  });
}

export function useStudentCreateConversation() {
  const queryClient = useQueryClient();
  const api = getStudentApi();

  return useMutation<
    { conversation: TeacherConversation; message: TeacherConversationMessage },
    Error,
    {
      classroomId: string;
      category: TeacherMessageCategory;
      subject: string;
      body: string;
    }
  >({
    mutationFn: (input) => api.createConversation(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: studentMessageQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: ["student-conversations", { classroomId: variables.classroomId }],
      });
    },
  });
}

export function useStudentReplyMessage(conversationId: string) {
  const queryClient = useQueryClient();
  const api = getStudentApi();

  return useMutation<
    { message: TeacherConversationMessage; conversation: TeacherConversation },
    Error,
    { body: string }
  >({
    mutationFn: (input) => api.replyToConversation(conversationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: studentMessageQueryKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: studentMessageQueryKeys.detail(conversationId),
      });
    },
  });
}
