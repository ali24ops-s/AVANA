/**
 * Observability Fastify plugin.
 *
 * PR-11: Wires logging and metrics hooks into the Fastify lifecycle.
 * - Logs each request with correlation ID, method, url, status code, duration
 * - Tracks request count and error metrics
 * - Redacts sensitive fields from logs
 *
 * Registered at the application level in createApp.ts.
 */

import type { FastifyPluginAsync } from "fastify";
import type pino from "pino";
import { metrics } from "./metrics.js";

export interface ObservabilityPluginOptions {
  logger: pino.Logger;
}

export const observabilityPlugin: FastifyPluginAsync<
  ObservabilityPluginOptions
> = async (app, opts) => {
  const { logger } = opts;

  // Log each request and track metrics
  app.addHook("onRequest", async (request) => {
    const reqAny = request as unknown as {
      context?: { requestId?: string };
    };
    const requestId = reqAny.context?.requestId ?? "(missing)";

    metrics.increment("http_requests_total", {
      method: request.method,
      // Use route url pattern or actual url
      route: request.routeOptions?.url ?? request.url,
    });

    logger.info(
      {
        req: {
          method: request.method,
          url: request.url,
          requestId,
        },
      },
      "incoming request",
    );
  });

  // Log response and track error metrics
  app.addHook("onResponse", async (request, reply) => {
    const reqAny = request as unknown as {
      context?: { requestId?: string };
    };
    const requestId = reqAny.context?.requestId ?? "(missing)";
    const statusCode = reply.statusCode;

    if (statusCode >= 400) {
      metrics.increment("http_errors_total", {
        status_code: String(statusCode),
      });
    }

    logger.info(
      {
        res: {
          statusCode,
          requestId,
        },
        responseTime: reply.elapsedTime,
      },
      "request completed",
    );
  });
};
