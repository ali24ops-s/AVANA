import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { RequestContext } from "./types.js";

export const REQUEST_ID_HEADER = "x-request-id";

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

    const requestId =
      typeof raw === "string" && raw.trim().length > 0 ? raw : randomUUID();

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
