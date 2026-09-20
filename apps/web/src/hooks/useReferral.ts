/**
 * React Query hooks for AVANA Referral System.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createReferralApi } from "../lib/api/referral.js";

function getReferralApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createReferralApi(client);
}

/**
 * Hook to fetch current user's referral code, invite link & stats summary.
 */
export function useMyReferralSummary() {
  const api = getReferralApi();
  return useQuery({
    queryKey: ["my-referral-summary"],
    queryFn: () => api.getMySummary(),
    staleTime: 30_000,
  });
}

/**
 * Hook to fetch current user's referral history.
 */
export function useMyReferralHistory(params?: {
  limit?: number;
  offset?: number;
}) {
  const api = getReferralApi();
  return useQuery({
    queryKey: ["my-referral-history", params?.limit, params?.offset],
    queryFn: () => api.getMyHistory(params),
    staleTime: 30_000,
  });
}

/**
 * Hook to validate a referral code publicly.
 */
export function useValidateReferralCode(code: string, enabled = true) {
  const api = getReferralApi();
  return useQuery({
    queryKey: ["validate-referral-code", code],
    queryFn: () => api.validateCode(code),
    enabled: enabled && Boolean(code.trim()),
    staleTime: 60_000,
  });
}

/**
 * Hook for Admins to list referrals.
 */
export function useAdminReferrals(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const api = getReferralApi();
  return useQuery({
    queryKey: ["admin-referrals", params?.status, params?.limit, params?.offset],
    queryFn: () => api.getAdminReferrals(params),
    staleTime: 10_000,
  });
}

/**
 * Hook for Admins to retry pending/failed rewards.
 */
export function useRetryReferralRewards() {
  const api = getReferralApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.retryRewards(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
    },
  });
}

/**
 * Hook to get system referral config.
 */
export function useReferralConfig() {
  const api = getReferralApi();
  return useQuery({
    queryKey: ["referral-config"],
    queryFn: () => api.getConfig(),
    staleTime: 60_000,
  });
}

/**
 * Hook to update system referral config.
 */
export function useUpdateReferralConfig() {
  const api = getReferralApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      enabled?: boolean;
      rewardDays?: number;
      rewardAmount?: number;
      maxRewardedReferrals?: number;
    }) => api.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referral-config"] });
    },
  });
}
