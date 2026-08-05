import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@avana/contracts";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/health", async (request, reply) => {
    const headerId = request.headers["x-request-id"] as unknown as
      string | undefined;

    const ctxId = (request as unknown as { context?: { requestId?: string } })
      .context?.requestId;

    const requestId =
      typeof headerId === "string" && headerId.trim().length > 0
        ? headerId
        : typeof ctxId === "string" && ctxId.trim().length > 0
          ? ctxId
          : "(missing-request-id)";

    reply.header("x-request-id", requestId);

    const response: HealthResponse = { ok: true, request_id: requestId };
    reply.send(response);
  });
};
