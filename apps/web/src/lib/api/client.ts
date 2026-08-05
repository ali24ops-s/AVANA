/**
 * Typed API client for AVANA backend.
 *
 * Centralises:
 *  - request handling with credentials (cookies)
 *  - authentication credentials (session + CSRF cookies)
 *  - error envelope parsing into typed ApiError
 *  - request ID header propagation
 *
 * All backend calls go through this client; never use raw fetch.
 */

import type { ErrorEnvelope } from "@avana/contracts";
import { ApiError } from "./errors.js";

export type ApiClientOptions = {
  baseUrl: string;
  /**
   * Optional CSRF token that will be sent as x-csrf-token header
   * for state-changing requests (POST, PATCH, DELETE).
   */
  csrfToken?: string;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Get the API base URL for the current environment.
 *
 * Returns an empty string so all API requests use same-origin relative URLs
 * (e.g. /v1/organizations), which go through the Vite dev server proxy
 * in development. In production, requests are same-origin.
 *
 * The Vite proxy (vite.config.ts) forwards /v1/* to the API backend.
 */
export function getApiBaseUrl(): string {
  return "";
}

/**
 * Create a configured API client bound to a base URL.
 */
export function createApiClient(options: ApiClientOptions) {
  const { baseUrl } = options;

  async function request<T>(
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const { method = "GET", body, headers: extraHeaders } = opts;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-request-id": crypto.randomUUID(),
      ...extraHeaders,
    };

    // Attach CSRF token for state-changing requests
    if (options.csrfToken && ["POST", "PATCH", "DELETE"].includes(method)) {
      headers["x-csrf-token"] = options.csrfToken;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      credentials: "include", // Send cookies (avana_session)
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    if (!response.ok) {
      const envelope = data as ErrorEnvelope;
      throw new ApiError(envelope);
    }

    return data as T;
  }

  return {
    get<T>(path: string, opts?: Omit<RequestOptions, "method">): Promise<T> {
      return request<T>(path, { ...opts, method: "GET" });
    },
    post<T>(
      path: string,
      body?: unknown,
      opts?: Omit<RequestOptions, "method" | "body">,
    ): Promise<T> {
      return request<T>(path, { ...opts, method: "POST", body });
    },
    patch<T>(
      path: string,
      body?: unknown,
      opts?: Omit<RequestOptions, "method" | "body">,
    ): Promise<T> {
      return request<T>(path, { ...opts, method: "PATCH", body });
    },
    delete<T>(path: string, opts?: Omit<RequestOptions, "method">): Promise<T> {
      return request<T>(path, { ...opts, method: "DELETE" });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
