import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { RequestContext } from "./types.js";

export const REQUEST_ID_HEADER = "x-request-id";

const REQUEST_ID_REGEX = /^[a-zA-Z0-9_\-\.]{1,64}$/;

/**
 * Sanitizes and validates request IDs to ensure max 64 alphanumeric chars
 * matching database varchar(64) column constraints.
 * Generates fresh UUID if invalid, malicious, or empty.
 */
export function sanitizeRequestId(raw: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (REQUEST_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return randomUUID();
}

export type RequestIdDecorateOptions = {
  onAssign?: (requestId: string) => void;
};

export type RequestWithContext = FastifyRequest & {
  context: RequestContext;
};

export const requestIdPlugin: FastifyPluginAsync<
  RequestIdDecorateOptions
> = async (app, opts) => {
  app.addHook("onRequest", async (request) => {
    const raw = request.headers[REQUEST_ID_HEADER];
    const requestId = sanitizeRequestId(raw);

    // Overwrite header with sanitized version for downstream consistency
    request.headers[REQUEST_ID_HEADER] = requestId;

    opts.onAssign?.(requestId);

    // Fastify supports attaching arbitrary properties; however, typings and
    // inject internals may differ. Keep a single source of truth on request
    // and ensure it is always present for downstream handlers.
    const r = request as unknown as RequestWithContext;
    r.context = r.context ?? ({} as RequestContext);
    r.context.requestId = requestId;

    // Also expose it via request.raw.headers for any handler paths that read
    // directly from headers.
    if (request.raw) {
      (request.raw.headers as unknown as Record<string, unknown>) =
        request.headers as unknown as Record<string, unknown>;
    }
  });
};
