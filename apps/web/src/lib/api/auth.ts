/**
 * Auth API calls using the typed client and contract types.
 *
 * All types come from @avana/contracts — no manual duplication.
 */

import type {
  MeResponse,
  SignInRequest,
  SignInResponse,
  RegisterRequest,
  RegisterResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
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
    signIn(email: string, password: string): Promise<SignInResponse> {
      const body: SignInRequest = { email, password };
      return client.post<SignInResponse>("/v1/auth/sign-in", body);
    },

    /**
     * POST /v1/auth/register — Create account and session.
     */
    signUp(email: string, password: string, name?: string): Promise<RegisterResponse> {
      const body: RegisterRequest = { email, password, name };
      return client.post<RegisterResponse>("/v1/auth/register", body);
    },

    /**
     * POST /v1/auth/verify-email — Verify 6-digit verification code.
     */
    verifyEmail(code: string): Promise<VerifyEmailResponse> {
      const body: VerifyEmailRequest = { code };
      return client.post<VerifyEmailResponse>("/v1/auth/verify-email", body);
    },

    /**
     * POST /v1/auth/resend-verification — Request a new verification code.
     */
    resendVerification(email?: string): Promise<ResendVerificationResponse> {
      const body: ResendVerificationRequest = { email };
      return client.post<ResendVerificationResponse>("/v1/auth/resend-verification", body);
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
