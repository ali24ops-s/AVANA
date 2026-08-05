/**
 * Auth API calls using the typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  MeResponse,
  SignInRequest,
  SignInResponse,
} from "@avana/contracts";
import type { ApiClient } from "./client.js";

export function createAuthApi(client: ApiClient) {
  return {
    /**
     * GET /v1/me — Current authenticated user.
     */
    getMe(): Promise<MeResponse> {
      return client.get<MeResponse>("/v1/me");
    },

    /**
     * POST /v1/auth/sign-in — Authenticate and create session.
     */
    signIn(email: string): Promise<SignInResponse> {
      const body: SignInRequest = { email };
      return client.post<SignInResponse>("/v1/auth/sign-in", body);
    },

    /**
     * POST /v1/auth/sign-out — Revoke session.
     */
    signOut(): Promise<void> {
      return client.post<void>("/v1/auth/sign-out");
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
