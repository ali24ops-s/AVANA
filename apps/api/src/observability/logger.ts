/**
 * Structured logger configuration.
 *
 * PR-11: Pino-based logger with:
 * - silent level in test environment (tests remain quiet)
 * - structured JSON output in development/production
 * - request/correlation ID on every log entry
 * - redaction of sensitive fields (authorization, cookies, tokens)
 */

import pino from "pino";
import type { ApiConfig } from "../config.js";

export function createLogger(config: ApiConfig): pino.Logger {
  const redactPaths: string[] = [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['set-cookie']",
    "res.headers['set-cookie']",
    "req.body.password",
    "req.body.token",
    "req.body.secret",
  ];

  return pino({
    name: "avana-api",
    level: config.logging.level,
    redact: {
      paths: redactPaths,
      censor: "[REDACTED]",
    },
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
    // Silent in test, structured JSON in dev/prod
    transport:
      config.nodeEnv === "development"
        ? {
            target: "pino/file",
            options: { destination: 1 },
          }
        : undefined,
  });
}
