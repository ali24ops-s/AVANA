/**
 * Typed API error that mirrors the contract ErrorEnvelope shape.
 *
 * Provides structured error access for consumers (UI, hooks,
 * TanStack Query error handling, etc.).
 */

import type { ErrorEnvelope } from "@avana/contracts";
import { getUserFriendlyErrorMessage } from "./error-mapper.js";

export class ApiError extends Error {
  public readonly code: ErrorEnvelope["error"]["code"] | "timeout" | "service_unavailable" | string;
  public readonly details?: ErrorEnvelope["error"]["details"];
  public readonly requestId: string;

  constructor(envelope?: Partial<ErrorEnvelope> | null) {
    const message = envelope?.error?.message || "An unexpected error occurred";
    super(message);
    this.name = "ApiError";
    this.code = envelope?.error?.code ?? "internal_error";
    this.details = envelope?.error?.details;
    this.requestId = envelope?.request_id ?? "";

    // Maintain prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Return a safe, respectful Persian error message suitable for direct UI display.
   */
  getUserMessage(): string {
    return getUserFriendlyErrorMessage(this);
  }

  get isNetworkError(): boolean {
    return this.code === "service_unavailable";
  }

  get isTimeout(): boolean {
    return this.code === "timeout";
  }

  get status(): number {
    return this.statusCode;
  }

  get statusCode(): number {
    switch (this.code) {
      case "bad_request":
        return 400;
      case "unauthorized":
        return 401;
      case "forbidden":
        return 403;
      case "not_found":
        return 404;
      case "timeout":
        return 408;
      case "conflict":
        return 409;
      case "unprocessable":
        return 422;
      case "too_many_requests":
      case "rate_limit_exceeded":
        return 429;
      case "service_unavailable":
        return 503;
      case "internal_error":
      default:
        return 500;
    }
  }
}
