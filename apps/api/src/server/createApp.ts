import fastify from "fastify";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import multipart from "@fastify/multipart";
import type pino from "pino";
import type { ApiConfig } from "../config.js";
import { requestIdPlugin } from "../http/requestId.js";
import { writeErrorEnvelope } from "../http/errorEnvelope.js";
import { DomainError } from "@avana/domain";
import { createLogger } from "../observability/logger.js";
import { observabilityPlugin } from "../observability/plugin.js";
import { securityPlugin } from "../http/security.js";

export type CreateAppOptions = {
  config: ApiConfig;
  logger?: pino.Logger;
};

/**
 * Map a DomainError code to an HTTP status code.
 */
function mapDomainCodeToStatus(code: string): number {
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
    case "too_many_requests":
    case "rate_limit_exceeded":
      return 429;
    case "unprocessable":
      return 422;
    case "internal_error":
    default:
      return 500;
  }
}

/**
 * Check if an error is a DomainError (works across ESM/CommonJS boundaries).
 */
function isDomainError(err: unknown): err is DomainError {
  if (err instanceof DomainError) return true;
  return (
    typeof err === "object" &&
    err !== null &&
    (err as Record<string, unknown>).name === "DomainError" &&
    typeof (err as DomainError).code === "string"
  );
}

export function createApp({
  config,
  logger: providedLogger,
}: CreateAppOptions): FastifyInstance {
  const logger = providedLogger ?? createLogger(config);

  const fastifyLogger =
    config.nodeEnv === "test"
      ? { logger: false as const }
      : { loggerInstance: logger };

  const app = fastify({
    ...fastifyLogger,
    disableRequestLogging: true,
    trustProxy: true,
    // fastify v5 expects bodyLimit to be an integer bytes number.
    bodyLimit: Number(config.http.jsonBodyLimit),
  }) as unknown as FastifyInstance;

  // `fastify` v5 has server generic defaults that can differ depending on Node typings.
  // Casting here keeps createApp's public surface stable without affecting runtime.

  // Decorate request context with config.
  // IMPORTANT: preserve requestId that may already be assigned by requestIdPlugin.
  app.addHook("onRequest", async (request) => {
    const reqAny = request as unknown as {
      context?: Partial<{ requestId: string; config: ApiConfig }>;
    };

    reqAny.context = reqAny.context ?? {};

    // Do not touch reqAny.context.requestId; only set config.
    reqAny.context.config = config;
  });

  void app.register(requestIdPlugin);

  // Register observability hooks (logging, metrics) if not test
  if (config.nodeEnv !== "test") {
    void app.register(observabilityPlugin, { logger });
  }

  // Register global security middleware (Helmet, CORS, rate-limit)
  void app.register(securityPlugin, { config });

  // Register multipart parsing for document uploads (max 50 MB).
  void app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024,
      files: 1,
    },
  });

  // Apply error handler directly on the root app (not as a child plugin)
  // so it catches errors from ALL child contexts and plugins.
  app.setErrorHandler(
    (err: Error, request: FastifyRequest, reply: FastifyReply) => {
      // Handle rate limit error objects or DomainErrors
      type CustomErrorShape = Error & {
        code?: string;
        error?: { code?: string; message?: string };
      };
      const customErr = err as CustomErrorShape;
      const rawCode =
        typeof err === "object" && err !== null
          ? customErr.code || customErr.error?.code
          : undefined;

      if (rawCode === "too_many_requests" || rawCode === "rate_limit_exceeded") {
        const message =
          customErr.message ||
          customErr.error?.message ||
          "تعداد درخواست‌های بیش از حد مجاز. لطفاً یک دقیقه دیگر دوباره تلاش کنید.";
        writeErrorEnvelope(reply, request, rawCode, message, 429);
        return;
      }

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

      const fastifyStatus = (err as { statusCode?: number }).statusCode;
      if (fastifyStatus && fastifyStatus >= 400 && fastifyStatus < 500) {
        const errCode = fastifyStatus === 429 ? "too_many_requests" : "bad_request";
        writeErrorEnvelope(
          reply,
          request,
          errCode,
          err.message,
          fastifyStatus,
        );
        return;
      }

      // Fallback for unknown errors.
      request.log?.error(err);
      if (config.nodeEnv !== "production") {
        process.stderr.write(`[unhandled-error] ${err?.stack || err?.message || String(err)}\n`);
      }
      writeErrorEnvelope(
        reply,
        request,
        "internal_error",
        "Internal error",
        500,
      );
    },
  );

  // Unknown route -> standard envelope.
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    writeErrorEnvelope(reply, request, "not_found", "Not found", 404);
  });

  // Lightweight graceful shutdown (no-op for now; tests cover no throw).
  const shutdown = async () => {
    try {
      await app.close();
    } catch {
      // swallow
    }
  };

  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });

  return app as unknown as FastifyInstance;
}
