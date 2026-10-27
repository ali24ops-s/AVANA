/**
 * Onboarding Tour API Client for AVANA Web.
 */

import type {
  OnboardingTourStatusResponse,
  OnboardingTourUpdateResponse,
} from "@avana/domain";

export interface OnboardingTourApi {
  getStatus(): Promise<OnboardingTourStatusResponse>;
  updateStatus(action: "skip" | "complete", step?: number): Promise<OnboardingTourUpdateResponse>;
}

export function createOnboardingTourApi(client: {
  get: <T>(path: string, opts?: { headers?: Record<string, string> }) => Promise<T>;
  post: <T>(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) => Promise<T>;
}): OnboardingTourApi {
  return {
    async getStatus(): Promise<OnboardingTourStatusResponse> {
      return client.get<OnboardingTourStatusResponse>("/v1/onboarding/tour");
    },
    async updateStatus(
      action: "skip" | "complete",
      step: number = 1,
    ): Promise<OnboardingTourUpdateResponse> {
      return client.post<OnboardingTourUpdateResponse>("/v1/onboarding/tour", { action, step });
    },
  };
}
