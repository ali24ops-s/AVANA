/**
 * React Query hooks for AVANA User Wallet and Transaction Ledger.
 */

import { useQuery } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createWalletApi } from "../lib/api/wallet.js";

function getWalletApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createWalletApi(client);
}

/**
 * Hook to fetch current user's wallet balance and currency.
 */
export function useMyWallet() {
  const api = getWalletApi();
  return useQuery({
    queryKey: ["my-wallet"],
    queryFn: () => api.getMyWallet(),
    staleTime: 15_000,
  });
}

/**
 * Hook to fetch current user's transaction history ledger.
 */
export function useMyWalletTransactions(params?: {
  limit?: number;
  offset?: number;
}) {
  const api = getWalletApi();
  return useQuery({
    queryKey: ["my-wallet-transactions", params?.limit, params?.offset],
    queryFn: () => api.getMyTransactions(params),
    staleTime: 15_000,
  });
}

/**
 * Hook to fetch current user's wallet top-up requests.
 */
export function useMyWalletTopups() {
  const api = getWalletApi();
  return useQuery({
    queryKey: ["my-wallet-topups"],
    queryFn: () => api.getMyTopups(),
    staleTime: 15_000,
  });
}
