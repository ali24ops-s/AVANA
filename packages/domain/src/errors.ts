/**
 * Domain error abstractions.
 *
 * Keep errors framework-independent and serializable.
 */

export type DomainErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "internal_error";

export interface DomainErrorDetails {
  [key: string]: string | number | boolean | null | undefined;
}

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly details?: DomainErrorDetails;

  constructor(
    code: DomainErrorCode,
    message: string,
    details?: DomainErrorDetails,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;

    // Maintain prototype chain for instanceof checks across package boundaries
    Object.setPrototypeOf(this, DomainError.prototype);
  }
}
