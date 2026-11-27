/**
 * React Query hooks for managing Clinical Reviewer Credentials.
 *
 * Endpoints:
 * - GET  /v1/pocket/reviewers/credentials
 * - GET  /v1/pocket/reviewers/credentials/:id
 * - POST /v1/pocket/reviewers/credentials
 * - POST /v1/pocket/reviewers/credentials/:id/suspend
 * - POST /v1/pocket/reviewers/credentials/:id/revoke
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import type {
  ClinicalReviewerCredential,
  GrantReviewerCredentialRequest,
  ListReviewerCredentialsQuery,
  ReactivateReviewerCredentialRequest,
  ReviewerCredentialEventRecord,
  RevokeReviewerCredentialRequest,
  SuspendReviewerCredentialRequest,
} from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export function usePocketReviewerCredentials(
  query?: ListReviewerCredentialsQuery,
  options?: { enabled?: boolean },
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<ClinicalReviewerCredential[]>({
    queryKey: pocketKeys.reviewerCredentials(query),
    queryFn: ({ signal }) => api.listCredentials(query, signal),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function usePocketReviewerCredential(id: string | undefined | null) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<ClinicalReviewerCredential>({
    queryKey: pocketKeys.reviewerCredential(id ?? ""),
    queryFn: ({ signal }) => api.getCredential(id!, signal),
    enabled: Boolean(isAuthenticated && id && id.trim().length > 0),
    staleTime: 60_000,
  });
}

export function useGrantReviewerCredential() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: (body: GrantReviewerCredentialRequest) => api.grantCredential(body),
    onSuccess: (newCred) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.reviewers() });
      queryClient.setQueryData(pocketKeys.reviewerCredential(newCred.id), newCred);
    },
  });
}

export function useSuspendReviewerCredential() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SuspendReviewerCredentialRequest }) =>
      api.suspendCredential(id, body),
    onSuccess: (updatedCred) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.reviewers() });
      queryClient.setQueryData(pocketKeys.reviewerCredential(updatedCred.id), updatedCred);
    },
  });
}

export function useRevokeReviewerCredential() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RevokeReviewerCredentialRequest }) =>
      api.revokeCredential(id, body),
    onSuccess: (updatedCred) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.reviewers() });
      queryClient.setQueryData(pocketKeys.reviewerCredential(updatedCred.id), updatedCred);
    },
  });
}

export function useReactivateReviewerCredential() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: ReactivateReviewerCredentialRequest }) =>
      api.reactivateCredential(id, body),
    onSuccess: (updatedCred) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.reviewers() });
      queryClient.setQueryData(pocketKeys.reviewerCredential(updatedCred.id), updatedCred);
    },
  });
}

export function usePocketReviewerCredentialEvents(
  id: string | undefined | null,
  enabled = true,
) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<ReviewerCredentialEventRecord[]>({
    queryKey: [...pocketKeys.reviewerCredential(id ?? ""), "events"],
    queryFn: ({ signal }) => api.listCredentialEvents(id!, signal),
    enabled: Boolean(isAuthenticated && enabled && id && id.trim().length > 0),
    staleTime: 15_000,
  });
}
