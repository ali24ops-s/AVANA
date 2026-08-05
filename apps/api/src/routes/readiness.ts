import type { FastifyPluginAsync } from "fastify";
import type { HealthResponse } from "@avana/contracts";

export const readinessRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/readiness", async (request, reply) => {
    const headerId = request.headers["x-request-id"] as unknown as
      string | undefined;

    const requestId =
      typeof headerId === "string" && headerId.trim().length > 0
        ? headerId
        : ((request as unknown as { context?: { requestId?: string } }).context
            ?.requestId ?? "");

    reply.header("x-request-id", requestId);

    const response: HealthResponse = { ok: true, request_id: requestId };
    reply.send(response);
  });
};
