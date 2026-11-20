import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPollsApi,
  type SubmitPollVoteInput,
} from "../lib/api/polls-api.js";

export const publicPollKeys = {
  all: ["public", "polls"] as const,
  poll: (slug: string | undefined) => [...publicPollKeys.all, "detail", slug] as const,
  results: (slug: string | undefined) => [...publicPollKeys.all, "results", slug] as const,
};

export function usePublicPoll(slug: string | undefined) {
  const pollsApi = getPollsApi();
  return useQuery({
    queryKey: publicPollKeys.poll(slug),
    queryFn: async () => {
      if (!slug) throw new Error("اسلاگ نظرسنجی مشخص نشده است.");
      const res = await pollsApi.getPublicPoll(slug);
      return res.poll;
    },
    enabled: Boolean(slug),
  });
}

export function usePublicPollResults(slug: string | undefined, enabled = true) {
  const pollsApi = getPollsApi();
  return useQuery({
    queryKey: publicPollKeys.results(slug),
    queryFn: async () => {
      if (!slug) throw new Error("اسلاگ نظرسنجی مشخص نشده است.");
      const res = await pollsApi.getPublicResults(slug);
      return res.results;
    },
    enabled: Boolean(slug) && enabled,
  });
}

export function useSubmitVoteMutation(slug: string) {
  const queryClient = useQueryClient();
  const pollsApi = getPollsApi();

  return useMutation({
    mutationFn: (answers: SubmitPollVoteInput) =>
      pollsApi.submitVote(slug, answers),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: publicPollKeys.poll(slug) });
      if (data.results) {
        queryClient.setQueryData(publicPollKeys.results(slug), data.results);
      } else {
        void queryClient.invalidateQueries({ queryKey: publicPollKeys.results(slug) });
      }
    },
  });
}
