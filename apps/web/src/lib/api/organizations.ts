/**
 * Organization API calls using the typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  OrganizationListResponse,
  OrganizationResponse,
  CreateOrganizationRequest,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createOrganizationApi(client: ApiClient) {
  return {
    /**
     * GET /v1/organizations — List organizations visible to the actor.
     */
    listOrganizations(): Promise<OrganizationListResponse> {
      return client.get<OrganizationListResponse>("/v1/organizations");
    },

    /**
     * POST /v1/organizations — Create a new organization.
     */
    createOrganization(name: string): Promise<OrganizationResponse> {
      const body: CreateOrganizationRequest = { name };
      return client.post<OrganizationResponse>("/v1/organizations", body);
    },
  };
}

export type OrganizationApi = ReturnType<typeof createOrganizationApi>;
