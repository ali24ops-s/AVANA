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
import { DEFAULT_PERSIAN_MESSAGES } from "./error-mapper.js";

export type ApiClientOptions = {
  baseUrl: string;
  /**
   * Optional CSRF token that will be sent as x-csrf-token header
   * for state-changing requests (POST, PATCH, DELETE).
   */
  csrfToken?: string;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  signal?: AbortSignal;
};

/**
 * Generate a UUID v4 string safely across all environments:
 * - HTTPS secure contexts (crypto.randomUUID)
 * - HTTP insecure contexts (window.crypto.randomUUID is undefined on Safari / Chrome)
 * - Environments without crypto.randomUUID
 */
export function generateUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback if blocked
    }
  }

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10xx
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } catch {
      // Fallback to Math.random
    }
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get the API base URL for the current environment.
 *
 * Returns configurable VITE_API_BASE_URL / VITE_API_URL if set.
 * In development, returns an empty string so all API requests use same-origin relative URLs
 * (e.g. /v1/organizations) through the Vite dev server proxy to the backend.
 */
export function getApiBaseUrl(): string {
  const envUrl =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
    (import.meta.env.VITE_API_URL as string | undefined);
  return envUrl ? envUrl.replace(/\/+$/, "") : "";
}

/**
 * Safely build a path by merging and serializing query parameters.
 * - Strips `null` and `undefined` values.
 * - Preserves existing query parameters on `path`.
 * - For arrays, appends each valid element using standard multi-param serialization (`key=val1&key=val2`).
 */
export function buildUrlWithParams(
  path: string,
  params?: Record<string, unknown>
): string {
  if (!params || Object.keys(params).length === 0) {
    return path;
  }

  const [basePath, existingQuery] = path.split("?");
  const searchParams = new URLSearchParams(existingQuery || "");

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      searchParams.delete(key);
      for (const item of value) {
        if (item !== undefined && item !== null) {
          searchParams.append(key, String(item));
        }
      }
    } else {
      searchParams.set(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

/**
 * Extract CSRF token from browser document.cookie.
 */
export function getCsrfTokenFromCookie(): string | undefined {
  if (typeof document === "undefined" || !document.cookie) return undefined;
  const match = document.cookie.match(/(?:^|;\s*)avana_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Ensure an active CSRF token is available, bootstrapping from /v1/auth/session if necessary.
 */
export async function ensureCsrfToken(baseUrl: string, signal?: AbortSignal): Promise<string | undefined> {
  let activeCsrfToken = getCsrfTokenFromCookie();
  if (!activeCsrfToken && typeof document !== "undefined") {
    try {
      await fetch(`${baseUrl}/v1/auth/session`, {
        method: "GET",
        credentials: "include",
        signal,
      });
      activeCsrfToken = getCsrfTokenFromCookie();
    } catch {
      // If bootstrap fails, proceed so server response is cleanly handled
    }
  }
  return activeCsrfToken;
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
    const { method = "GET", body, headers: extraHeaders, params, signal } = opts;
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

    const headers: Record<string, string> = {
      "x-request-id": generateUUID(),
      ...extraHeaders,
    };

    if (body !== undefined && !isFormData) {
      headers["Content-Type"] = "application/json";
    }

    // Attach CSRF token for state-changing requests
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      let activeCsrfToken = options.csrfToken || getCsrfTokenFromCookie();
      const isPublicAuthRoute =
        path.startsWith("/v1/auth/sign-in") ||
        path.startsWith("/v1/auth/register") ||
        path.startsWith("/v1/auth/sign-up") ||
        path.startsWith("/v1/auth/otp") ||
        path.startsWith("/v1/auth/password");

      if (!activeCsrfToken && typeof document !== "undefined" && !isPublicAuthRoute) {
        activeCsrfToken = await ensureCsrfToken(baseUrl, signal);
      }

      if (activeCsrfToken) {
        headers["x-csrf-token"] = activeCsrfToken;
      }
    }

    const finalPath = buildUrlWithParams(path, params);
    const fetchBody: BodyInit | undefined = isFormData
      ? (body as FormData)
      : body !== undefined
        ? JSON.stringify(body)
        : undefined;

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${finalPath}`, {
        method,
        headers,
        credentials: "include", // Send cookies (avana_session)
        body: fetchBody,
        signal,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError({
          request_id: generateUUID(),
          error: {
            code: "timeout" as ErrorEnvelope["error"]["code"],
            message: "مهلت زمانی درخواست به پایان رسید. لطفاً دوباره تلاش کنید.",
          },
        });
      }

      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      throw new ApiError({
        request_id: generateUUID(),
        error: {
          code: "service_unavailable" as ErrorEnvelope["error"]["code"],
          message: isOffline
            ? "ارتباط با اینترنت برقرار نیست. لطفاً وضعیت شبکه خود را بررسی کنید."
            : "خطا در برقراری ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کنید.",
        },
      });
    }

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
      const headerRequestId =
        typeof response.headers?.get === "function"
          ? response.headers.get("x-request-id")
          : undefined;
      const requestId = headerRequestId || generateUUID();
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

      if (
        data &&
        typeof data === "object" &&
        "error" in data &&
        data.error &&
        typeof (data as ErrorEnvelope).error === "object"
      ) {
        throw new ApiError(data as ErrorEnvelope);
      }

      if (data && typeof data === "object") {
        const anyData = data as Record<string, unknown>;
        const rawMessage =
          (typeof anyData.message === "string" && anyData.message) ||
          (typeof anyData.error === "string" && anyData.error);
        if (rawMessage) {
          const rawCode =
            (typeof anyData.code === "string" ? anyData.code : undefined) ||
            codeByStatus[response.status] ||
            "internal_error";
          throw new ApiError({
            request_id: requestId,
            error: {
              code: rawCode as any,
              message: rawMessage,
              details: anyData.details as any,
            },
          });
        }
      }

      const messageByStatus: Record<number, string> = {
        401: DEFAULT_PERSIAN_MESSAGES.unauthorized,
        403: DEFAULT_PERSIAN_MESSAGES.forbidden,
        404: DEFAULT_PERSIAN_MESSAGES.not_found,
        413: DEFAULT_PERSIAN_MESSAGES.file_too_large,
        502: DEFAULT_PERSIAN_MESSAGES.bad_gateway,
        503: DEFAULT_PERSIAN_MESSAGES.service_unavailable,
        504: DEFAULT_PERSIAN_MESSAGES.timeout,
      };

      const code = codeByStatus[response.status] || "internal_error";
      const message =
        messageByStatus[response.status] ||
        DEFAULT_PERSIAN_MESSAGES.general_error;

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
    postFormData<T>(
      path: string,
      formData: FormData,
      opts?: Omit<RequestOptions, "method" | "body">,
    ): Promise<T> {
      return request<T>(path, { ...opts, method: "POST", body: formData });
    },
    put<T>(
      path: string,
      body?: unknown,
      opts?: Omit<RequestOptions, "method" | "body">,
    ): Promise<T> {
      return request<T>(path, { ...opts, method: "PUT", body });
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
