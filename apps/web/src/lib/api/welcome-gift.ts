/**
 * Welcome Gift API Client for AVANA.
 */

import type {
  WelcomeGiftStatusResponse,
  WelcomeGiftAcknowledgeResponse,
} from "@avana/domain";

export interface WelcomeGiftApi {
  getStatus(): Promise<WelcomeGiftStatusResponse>;
  acknowledge(): Promise<WelcomeGiftAcknowledgeResponse>;
}

export function createWelcomeGiftApi(client: {
  get: <T>(path: string, opts?: { headers?: Record<string, string> }) => Promise<T>;
  post: <T>(path: string, body?: unknown, opts?: { headers?: Record<string, string> }) => Promise<T>;
}): WelcomeGiftApi {
  return {
    async getStatus(): Promise<WelcomeGiftStatusResponse> {
      return client.get<WelcomeGiftStatusResponse>("/v1/welcome-gift/status");
    },
    async acknowledge(): Promise<WelcomeGiftAcknowledgeResponse> {
      return client.post<WelcomeGiftAcknowledgeResponse>("/v1/welcome-gift/acknowledge");
    },
  };
}
