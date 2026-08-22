import { useMemo } from "react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createAdminApi } from "../lib/api/admin.js";

export function useAdmin() {
  return useMemo(() => {
    const client = createApiClient({ baseUrl: getApiBaseUrl() });
    return createAdminApi(client);
  }, []);
}
