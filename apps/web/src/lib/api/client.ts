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
      "x-request-id": crypto.randomUUID(),
      ...extraHeaders,
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

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

    let data: unknown;
    try {
      if (typeof response.text === "function") {
        const text = await response.text();
        data = text ? JSON.parse(text) : undefined;
      } else if (typeof response.json === "function") {
        data = await response.json();
      }
    } catch {
      data = null;
    }

    if (!response.ok) {
      if (
        data &&
        typeof data === "object" &&
        "error" in data &&
        data.error &&
        typeof (data as ErrorEnvelope).error === "object"
      ) {
        throw new ApiError(data as ErrorEnvelope);
      }

      // Map raw HTTP status codes to typed ApiError
      const requestId =
        response.headers.get("x-request-id") || crypto.randomUUID();
      const codeByStatus: Record<number, ErrorEnvelope["error"]["code"]> = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        413: "bad_request",
        422: "unprocessable",
        500: "internal_error",
        502: "internal_error",
        503: "internal_error",
        504: "internal_error",
      };

      const messageByStatus: Record<number, string> = {
        401: "You are not authorized. Please sign in.",
        403: "You do not have permission to perform this action.",
        404: "The requested resource was not found.",
        413: "The uploaded file is too large.",
        502: "Service temporarily unavailable. Please try again later.",
        503: "Service temporarily unavailable. Please try again later.",
        504: "Gateway timeout. Please try again later.",
      };

      const code = codeByStatus[response.status] || "internal_error";
      const message =
        messageByStatus[response.status] ||
        (response.status >= 500
          ? "A server error occurred. Please try again later."
          : `Request failed with status ${response.status}`);

      throw new ApiError({
        request_id: requestId,
        error: {
          code,
          message,
        },
      });
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
