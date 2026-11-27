/**
 * React Query hooks for Clinical Verification & Conflicts.
 *
 * Endpoints:
 * - GET  /v1/pocket/assertions/:id/verifications
 * - POST /v1/pocket/assertions/:id/verify
 * - POST /v1/pocket/assertions/:id/reject-verification
 * - POST /v1/pocket/assertions/conflicts
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import type {
  AssertionVerificationsResult,
  RecordConflictRequest,
  RejectVerificationRequest,
  ResolveConflictRequest,
  VerifyAssertionRequest,
} from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export function usePocketVerifications(id: string | undefined | null) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<AssertionVerificationsResult>({
    queryKey: pocketKeys.assertionVerifications(id ?? ""),
    queryFn: ({ signal }) => api.getVerifications(id!, signal),
    enabled: Boolean(isAuthenticated && id && id.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useVerifyAssertion() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VerifyAssertionRequest }) =>
      api.verifyAssertion(id, body),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertionVerifications(id) });
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertionHistory(id) });
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertions() });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "admin"] });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "reviewer-workbench"] });
    },
  });
}

export function useRejectAssertionVerification() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RejectVerificationRequest }) =>
      api.rejectVerification(id, body),
    onSuccess: (_, { id }) => {
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertionVerifications(id) });
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertionHistory(id) });
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertions() });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "admin"] });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "reviewer-workbench"] });
    },
  });
}

export function useRecordClinicalConflict() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: (body: RecordConflictRequest) => api.recordConflict(body),
    onSuccess: (_, body) => {
      if (body.assertionAId) {
        void queryClient.invalidateQueries({
          queryKey: pocketKeys.assertionVerifications(body.assertionAId),
        });
      }
      if (body.assertionBId) {
        void queryClient.invalidateQueries({
          queryKey: pocketKeys.assertionVerifications(body.assertionBId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "admin"] });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "reviewer-workbench"] });
    },
  });
}

export function useResolveClinicalConflict() {
  const queryClient = useQueryClient();
  const api = getPocketApi();

  return useMutation({
    mutationFn: ({
      conflictId,
      body,
    }: {
      conflictId: string;
      body: ResolveConflictRequest;
    }) => api.resolveConflict(conflictId, body),
    onSuccess: (resolved) => {
      if (resolved.assertionAId) {
        void queryClient.invalidateQueries({
          queryKey: pocketKeys.assertionVerifications(resolved.assertionAId),
        });
        void queryClient.invalidateQueries({
          queryKey: pocketKeys.assertionHistory(resolved.assertionAId),
        });
      }
      if (resolved.assertionBId) {
        void queryClient.invalidateQueries({
          queryKey: pocketKeys.assertionVerifications(resolved.assertionBId),
        });
        void queryClient.invalidateQueries({
          queryKey: pocketKeys.assertionHistory(resolved.assertionBId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: pocketKeys.assertions() });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "admin"] });
      void queryClient.invalidateQueries({ queryKey: [...pocketKeys.all, "reviewer-workbench"] });
    },
  });
}
