import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0"; // not used by inject
  return loadApiConfig(process.env);
}

describe("API PR-5 skeleton", () => {
  it("health returns ok + request_id", async () => {
    const config = makeTestConfig();
    const app = createApp({ config });
    void app.register(v1Routes);

    const res = await app.inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: true; request_id: string };
    expect(body.ok).toBe(true);
    expect(typeof body.request_id).toBe("string");
    expect(body.request_id.length).toBeGreaterThan(0);
  });

  it("readiness returns ok + request_id", async () => {
    const config = makeTestConfig();
    const app = createApp({ config });
    void app.register(v1Routes);

    const res = await app.inject({ method: "GET", url: "/v1/readiness" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: true; request_id: string };
    expect(body.ok).toBe(true);
    expect(typeof body.request_id).toBe("string");
  });

  it("unknown route returns standard error envelope", async () => {
    const config = makeTestConfig();
    const app = createApp({ config });
    void app.register(v1Routes);

    const res = await app.inject({ method: "GET", url: "/v1/does-not-exist" });
    expect(res.statusCode).toBe(404);

    const body = JSON.parse(res.body) as {
      request_id: string;
      error: { code: string; message: string };
    };

    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toBe("Not found");
    expect(typeof body.request_id).toBe("string");
    expect(body.request_id.length).toBeGreaterThan(0);
  });

  it("propagates x-request-id", async () => {
    const config = makeTestConfig();
    const app = createApp({ config });
    void app.register(v1Routes);

    const requestId = randomUUID();

    const res = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: { "x-request-id": requestId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { ok: true; request_id: string };
    expect(body.request_id).toBe(requestId);
  });

  it("invalid config fails fast", () => {
    const bad = {
      ...process.env,
      NODE_ENV: "nope",
      AVANA_API_PORT: "1234",
    };

    expect(() => loadApiConfig(bad)).toThrow(/NODE_ENV/i);
  });

  it("graceful shutdown does not throw", async () => {
    const config = makeTestConfig();
    const app = createApp({ config });
    void app.register(v1Routes);

    await expect(app.close()).resolves.toBeUndefined();
  });
});
