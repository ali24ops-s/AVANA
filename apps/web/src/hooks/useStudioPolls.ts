import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPollsApi,
  type PollStatus,
  type CreatePollInput,
  type UpdatePollInput,
  type CreatePollQuestionInput,
  type UpdatePollQuestionInput,
} from "../lib/api/polls-api.js";

export const studioPollsKeys = {
  all: ["studio", "polls"] as const,
  lists: () => [...studioPollsKeys.all, "list"] as const,
  list: (filters?: { status?: PollStatus; organizationId?: string }) =>
    [...studioPollsKeys.lists(), filters] as const,
  details: () => [...studioPollsKeys.all, "detail"] as const,
  detail: (id: string | undefined) => [...studioPollsKeys.details(), id] as const,
  results: () => [...studioPollsKeys.all, "results"] as const,
  result: (id: string | undefined) => [...studioPollsKeys.results(), id] as const,
};

export function useStudioPolls(filters?: { status?: PollStatus; organizationId?: string }) {
  const pollsApi = getPollsApi();
  return useQuery({
    queryKey: studioPollsKeys.list(filters),
    queryFn: async () => {
      const res = await pollsApi.listPolls(filters);
      return res.polls ?? [];
    },
  });
}

export function usePollDetails(pollId: string | undefined) {
  const pollsApi = getPollsApi();
  return useQuery({
    queryKey: studioPollsKeys.detail(pollId),
    queryFn: async () => {
      if (!pollId) throw new Error("شناسه نظرسنجی مشخص نشده است.");
      const res = await pollsApi.getPollById(pollId);
      return res.poll;
    },
    enabled: Boolean(pollId),
  });
}

export function usePollResults(pollId: string | undefined) {
  const pollsApi = getPollsApi();
  return useQuery({
    queryKey: studioPollsKeys.result(pollId),
    queryFn: async () => {
      if (!pollId) throw new Error("شناسه نظرسنجی مشخص نشده است.");
      const res = await pollsApi.getPollResults(pollId);
      return res.results;
    },
    enabled: Boolean(pollId),
  });
}

export function useCreatePollMutation() {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: (data: CreatePollInput) => pollsApi.createPoll(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.lists() });
    },
  });
}

export function useUpdatePollMutation(pollId?: string) {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePollInput }) =>
      pollsApi.updatePoll(id, data),
    onSuccess: (_res, variables) => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.lists() });
      const targetId = pollId || variables.id;
      if (targetId) {
        void queryClient.invalidateQueries({ queryKey: studioPollsKeys.detail(targetId) });
      }
    },
  });
}

export function useDeletePollMutation() {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: (id: string) => pollsApi.deletePoll(id),
    onSuccess: (_res, id) => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.lists() });
      void queryClient.removeQueries({ queryKey: studioPollsKeys.detail(id) });
    },
  });
}

export function usePublishPollMutation() {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: (id: string) => pollsApi.publishPoll(id),
    onSuccess: (_res, id) => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.detail(id) });
    },
  });
}

export function useClosePollMutation() {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: (id: string) => pollsApi.closePoll(id),
    onSuccess: (_res, id) => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.detail(id) });
    },
  });
}

export function useCreateQuestionMutation(pollId: string) {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: (data: CreatePollQuestionInput) =>
      pollsApi.createQuestion(pollId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.detail(pollId) });
    },
  });
}

export function useUpdateQuestionMutation(pollId: string) {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: ({ questionId, data }: { questionId: string; data: UpdatePollQuestionInput }) =>
      pollsApi.updateQuestion(pollId, questionId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.detail(pollId) });
    },
  });
}

export function useDeleteQuestionMutation(pollId: string) {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: (questionId: string) =>
      pollsApi.deleteQuestion(pollId, questionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.detail(pollId) });
    },
  });
}

export function useReorderQuestionsMutation(pollId: string) {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: (questionIds: string[]) =>
      pollsApi.reorderQuestions(pollId, questionIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioPollsKeys.detail(pollId) });
    },
  });
}
