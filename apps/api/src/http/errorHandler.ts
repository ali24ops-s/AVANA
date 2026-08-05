import type { FastifyPluginAsync } from "fastify";
import { DomainError } from "@avana/domain";
import { writeErrorEnvelope } from "./errorEnvelope.js";

function mapDomainCodeToStatus(code: DomainError["code"]): number {
  switch (code) {
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
    default:
      return 500;
  }
}

/**
 * Check if an error is a DomainError, handling cross-package
 * instanceof discrepancies (e.g. Vitest ESM transforms).
 */
function isDomainError(err: unknown): err is DomainError {
  if (err instanceof DomainError) return true;
  // Fallback: check the error's name property (works across package boundaries)
  return (
    typeof err === "object" &&
    err !== null &&
    (err as Record<string, unknown>).name === "DomainError" &&
    typeof (err as DomainError).code === "string"
  );
}

export const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((err, request, reply) => {
    if (isDomainError(err)) {
      const statusCode = mapDomainCodeToStatus(err.code);
      writeErrorEnvelope(
        reply,
        request,
        err.code,
        err.message,
        statusCode,
        err.details,
      );
      return;
    }

    // Fallback for unknown errors.
    writeErrorEnvelope(reply, request, "internal_error", "Internal error", 500);
  });

  // Unknown route -> standard envelope.
  app.setNotFoundHandler((request, reply) => {
    writeErrorEnvelope(reply, request, "not_found", "Not found", 404);
  });
};
