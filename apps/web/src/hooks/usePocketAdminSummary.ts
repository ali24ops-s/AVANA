/**
 * React Query hook for AVANA Pocket Admin Dashboard Summary (Phase 2.1).
 *
 * Endpoint: GET /v1/pocket/admin/summary (platform_admin only)
 */

import { useQuery } from "@tanstack/react-query";
import { getPocketApi } from "./usePocketReviewer.js";
import { pocketKeys } from "./pocketKeys.js";
import type { PocketAdminSummary } from "../lib/api/pocket.js";
import { useAuth } from "../providers/AuthProvider.js";

export function usePocketAdminSummary(options?: { enabled?: boolean }) {
  const { isAuthenticated } = useAuth();
  const api = getPocketApi();

  return useQuery<PocketAdminSummary>({
    queryKey: pocketKeys.adminSummary(),
    queryFn: ({ signal }) => api.getAdminSummary(signal),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}
