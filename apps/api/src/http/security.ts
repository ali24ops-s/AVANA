/**
 * HTTP Security Middleware.
 *
 * PR-11: Configures:
 * - HelmetAction security headers
 * - CORS configuration
 * - Rate limiting
 *
 * Registered at the application level in createApp.ts so it applies
 * to all routes including health/readiness endpoints.
 */

import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { ApiConfig } from "../config.js";

export interface SecurityPluginOptions {
  config: ApiConfig;
}

const securityPluginImpl: FastifyPluginAsync<SecurityPluginOptions> = async (
  app,
  opts,
) => {
  const { config } = opts;

  // 1. HelmetAction security headers
  // Uses sensible defaults: CSP, XSS, frameguard, etc.
  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled for API; managed by web app
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  // 2. CORS configuration
  await app.register(cors, {
    origin: config.security.cors.origin,
    credentials: config.security.cors.credentials,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",
      "X-CSRF-Token",
    ],
    exposedHeaders: ["X-Request-Id"],
  });

  // 3. Rate limiting (global for general API endpoints)
  await app.register(rateLimit, {
    max: config.security.rateLimit.max,
    timeWindow: config.security.rateLimit.timeWindowMs,
    keyGenerator: (request) => {
      return request.ip;
    },
    allowList: (request) => {
      return (
        request.url.startsWith("/v1/health") ||
        request.url.startsWith("/v1/readiness")
      );
    },
  });
};

export const securityPlugin = fastifyPlugin(securityPluginImpl, {
  name: "securityPlugin",
});
