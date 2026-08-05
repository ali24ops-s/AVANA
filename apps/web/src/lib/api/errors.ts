/**
 * Typed API error that mirrors the contract ErrorEnvelope shape.
 *
 * Provides structured error access for consumers (UI, hooks,
 * TanStack Query error handling, etc.).
 */

import type { ErrorEnvelope } from "@avana/contracts";

export class ApiError extends Error {
  public readonly code: ErrorEnvelope["error"]["code"];
  public readonly details?: ErrorEnvelope["error"]["details"];
  public readonly requestId: string;

  constructor(envelope: ErrorEnvelope) {
    super(envelope.error.message);
    this.name = "ApiError";
    this.code = envelope.error.code;
    this.details = envelope.error.details;
    this.requestId = envelope.request_id;

    // Maintain prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
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
      case "conflict":
        return 409;
      case "unprocessable":
        return 422;
      case "internal_error":
        return 500;
    }
  }
}
