import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../server/createApp.js";
import type { ApiConfig } from "../config.js";

describe("CORS, Credentials, CSRF & ETag Conditional Request Security", () => {
  let app: FastifyInstance;

  const allowedOrigin = "https://aavana.ir";
  const disallowedOrigin = "https://evil.example.com";

  beforeAll(async () => {
    const config = {
      nodeEnv: "test",
      server: { host: "127.0.0.1", port: 0 },
      http: { jsonBodyLimit: "1048576" },
      logging: { redactHeaders: ["authorization", "cookie"], level: "silent" },
      appUrl: allowedOrigin,
      security: {
        cors: {
          origin: [allowedOrigin, "https://www.aavana.ir"],
          credentials: true,
        },
        rateLimit: { max: 1000, timeWindowMs: 60_000 },
      },
    } as unknown as ApiConfig;

    app = createApp({ config });

    app.get("/v1/pocket/test-etag", async (request, reply) => {
      const etag = 'W/"drug-123-v1-abcdef"';
      if (request.headers["if-none-match"] === etag) {
        return reply.status(304).header("ETag", etag).send();
      }
      return reply
        .code(200)
        .header("ETag", etag)
        .header("X-Entity-Version", "1")
        .send({ success: true, data: { ok: true } });
    });

    app.post("/v1/pocket/test-csrf", async (_request, reply) => {
      return reply.code(200).send({ success: true });
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("allows configured origin with credentials and exposes ETag & X-Entity-Version", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/pocket/test-etag",
      headers: { origin: allowedOrigin },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const exposed = String(res.headers["access-control-expose-headers"] ?? "").toLowerCase();
    expect(exposed).toContain("etag");
    expect(exposed).toContain("x-entity-version");
    expect(exposed).toContain("x-request-id");
    expect(res.headers["etag"]).toBe('W/"drug-123-v1-abcdef"');
  });

  it("does not reflect or allow unauthorized origins", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/pocket/test-etag",
      headers: { origin: disallowedOrigin },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("handles preflight OPTIONS for GET with If-None-Match header", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/pocket/test-etag",
      headers: {
        origin: allowedOrigin,
        "access-control-request-method": "GET",
        "access-control-request-headers": "If-None-Match, Authorization",
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const allowedHeaders = String(res.headers["access-control-allow-headers"] ?? "").toLowerCase();
    expect(allowedHeaders).toContain("if-none-match");
    expect(allowedHeaders).toContain("authorization");
  });

  it("handles preflight OPTIONS for POST with X-CSRF-Token and Content-Type", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/pocket/test-csrf",
      headers: {
        origin: allowedOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "Content-Type, X-CSRF-Token",
      },
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const allowedMethods = String(res.headers["access-control-allow-methods"] ?? "");
    for (const m of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(allowedMethods).toContain(m);
    }
    const allowedHeaders = String(res.headers["access-control-allow-headers"] ?? "").toLowerCase();
    expect(allowedHeaders).toContain("x-csrf-token");
    expect(allowedHeaders).toContain("content-type");
  });

  it("supports conditional GET with If-None-Match returning 304 and CORS headers", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/pocket/test-etag",
      headers: {
        origin: allowedOrigin,
        "if-none-match": 'W/"drug-123-v1-abcdef"',
      },
    });

    expect(res.statusCode).toBe(304);
    expect(res.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(res.headers["etag"]).toBe('W/"drug-123-v1-abcdef"');
  });

  it("rejects preflight OPTIONS from unauthorized origin without exposing allowed origin", async () => {
    const res = await app.inject({
      method: "OPTIONS",
      url: "/v1/pocket/test-csrf",
      headers: {
        origin: disallowedOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "X-CSRF-Token",
      },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
