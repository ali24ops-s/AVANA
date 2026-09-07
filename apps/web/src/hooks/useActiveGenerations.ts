import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../providers/AuthProvider.js";
import { isUserAdmin } from "../utils/adminPermissions.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createGenerationApi,
  type ActiveGenerationItem,
} from "../lib/api/generation.js";

const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
const genApi = createGenerationApi(apiClient);

export function useActiveGenerations(overrideOrgId?: string) {
  const { user, memberships } = useAuth();
  const isAdmin = isUserAdmin(user, memberships);
  const organizationId =
    overrideOrgId && overrideOrgId.trim().length > 0
      ? overrideOrgId.trim()
      : undefined;

  const query = useQuery({
    queryKey: organizationId
      ? ["active-generations", organizationId]
      : ["active-generations", "global"],
    queryFn: () => genApi.getActiveGenerations(organizationId),
    enabled: Boolean(user) && isAdmin,
    staleTime: 1000,
    refetchIntervalInBackground: false,
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? [];
      const hasActive = items.some(
        (item) =>
          (item.status === "queued" ||
            item.status === "planning" ||
            item.status === "generating" ||
            item.status === "stopping" ||
            item.status === "deleting") &&
          item.stage !== "review" &&
          item.stage !== "publishing",
      );
      return hasActive ? 3000 : 8000;
    },
  });

  const rawItems: ActiveGenerationItem[] = query.data?.items ?? [];
  const items = rawItems.filter(
    (item) =>
      item.status !== "reviewing" &&
      item.status !== "completed" &&
      item.stage !== "review" &&
      item.stage !== "publishing",
  );
  const activeItems = items.filter(
    (item) =>
      item.status === "queued" ||
      item.status === "planning" ||
      item.status === "generating" ||
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
