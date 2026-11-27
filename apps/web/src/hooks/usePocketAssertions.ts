/**
 * React Query hooks for Assertion Review Lifecycle and Atomic Publishing.
 *
 * Endpoints:
 * - POST /v1/pocket/assertions/:id/submit-review
 * - POST /v1/pocket/assertions/:id/review-decision
 * - POST /v1/pocket/assertions/:id/withdraw-review
 * - POST /v1/pocket/assertions/:id/publish
 */

import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import { useAuth } from "../providers/AuthProvider.js";
import type {
  ClinicalAggregateType,
  PocketAdminAssertionDetail,
  PocketAdminAssertionsQuery,
  PocketAdminAssertionsResult,
  PocketReviewerAssertionDetail,
  PublishAssertionRequest,
  RecordReviewDecisionRequest,
  SubmitReviewRequest,
  WithdrawReviewRequest,
} from "../lib/api/pocket.js";

export function usePocketAdminAssertions(
  query?: PocketAdminAssertionsQuery,
  options?: { enabled?: boolean },
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<PocketAdminAssertionsResult>({
    queryKey: pocketKeys.adminAssertions(query),
    queryFn: ({ signal }) => api.listAdminAssertions(query, signal),
    enabled: isAuthenticated && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function usePocketAdminAssertionDetail(
  id: string | undefined | null,
  options?: { enabled?: boolean },
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<PocketAdminAssertionDetail>({
    queryKey: pocketKeys.adminAssertionDetail(id ?? ""),
    queryFn: ({ signal }) => api.getAdminAssertionDetail(id!, signal),
    enabled: Boolean(
      isAuthenticated && id && id.trim().length > 0 && (options?.enabled ?? true),
    ),
    staleTime: 15_000,
  });
}

export function usePocketReviewerAssertions(
  query?: PocketAdminAssertionsQuery,
  options?: { enabled?: boolean },
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<PocketAdminAssertionsResult>({
    queryKey: pocketKeys.reviewerAssertions(query),
    queryFn: ({ signal }) => api.listReviewerAssertions(query, signal),
    enabled: isAuthenticated && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function usePocketReviewerAssertionDetail(
  id: string | undefined | null,
  options?: { enabled?: boolean },
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<PocketReviewerAssertionDetail>({
    queryKey: pocketKeys.reviewerAssertionDetail(id ?? ""),
    queryFn: ({ signal }) => api.getReviewerAssertionDetail(id!, signal),
    enabled: Boolean(
      isAuthenticated && id && id.trim().length > 0 && (options?.enabled ?? true),
    ),
    staleTime: 15_000,
  });
}

export function useSubmitAssertionReview() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: SubmitReviewRequest }) =>
      api.submitReview(id, body),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertionHistory(id) });
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertions() });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "admin"] });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "reviewer-workbench"] });
    },
  });
}

export function useRecordReviewDecision() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RecordReviewDecisionRequest }) =>
      api.recordReviewDecision(id, body),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertionHistory(id) });
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertions() });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "admin"] });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "reviewer-workbench"] });
    },
  });
}

export function useWithdrawAssertionReview() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: WithdrawReviewRequest }) =>
      api.withdrawReview(id, body),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertionHistory(id) });
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertions() });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "admin"] });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "reviewer-workbench"] });
    },
  });
}

export function usePublishAssertion() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: PublishAssertionRequest }) =>
      api.publishAssertion(id, body),
    onSuccess: (result, { id }) => {
      // 1. Invalidate assertion history, assertion queries, admin dashboard/list/detail, and reviewer workbench
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertionHistory(id) });
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertions() });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "admin"] });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "reviewer-workbench"] });

      // 2. Precisely invalidate the affected Clinical Aggregate consumption and version probe caches
      if (result?.entityVersion?.aggregateType && result?.entityVersion?.aggregateId) {
        const aggType = result.entityVersion.aggregateType as ClinicalAggregateType;
        const aggId = result.entityVersion.aggregateId;

        void queryClient.invalidateQueries({
          queryKey: pocketKeys.consumption(aggType, aggId),
        });
        void queryClient.invalidateQueries({
          queryKey: pocketKeys.metadata(aggType, aggId),
        });
        void queryClient.invalidateQueries({
          queryKey: pocketKeys.version(aggType, aggId),
        });
      }
    },
  });
}
