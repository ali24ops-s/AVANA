import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createGenerationApi,
  type ActiveGenerationItem,
} from "../lib/api/generation.js";

const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
const genApi = createGenerationApi(apiClient);

export function useActiveGenerations(overrideOrgId?: string) {
  const { user, memberships } = useAuth();
  const organizationId = overrideOrgId || memberships?.[0]?.organization_id || "";

  const query = useQuery({
    queryKey: ["active-generations", organizationId],
    queryFn: () => genApi.getActiveGenerations(organizationId),
    enabled: Boolean(user && organizationId),
    staleTime: 1000,
    refetchIntervalInBackground: false,
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      const hasActive = items.some(
        (item) =>
          item.status === "queued" ||
          item.status === "planning" ||
          item.status === "generating" ||
          item.status === "reviewing" ||
          item.status === "stopping" ||
          item.status === "deleting",
      );
      return hasActive ? 3000 : false;
    },
  });

  const items: ActiveGenerationItem[] = query.data?.items ?? [];
  const activeItems = items.filter(
    (item) =>
      item.status === "queued" ||
      item.status === "planning" ||
      item.status === "generating" ||
      item.status === "reviewing" ||
      item.status === "stopping" ||
      item.status === "deleting",
  );
  const completedItems = items.filter((item) => item.status === "completed");
  const failedItems = items.filter((item) => item.status === "failed");
  const stoppedItems = items.filter((item) => item.status === "stopped");

  return {
    ...query,
    items,
    activeItems,
    completedItems,
    failedItems,
    stoppedItems,
    hasActiveGenerations: activeItems.length > 0,
  };
}
