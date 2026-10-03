/**
 * Real Fastify HTTP Server for AVANA Load Testing
 *
 * Runs the full production composition root and Fastify HTTP stack
 * bound to an actual TCP socket on 127.0.0.1.
 */

import { createApp } from "../../server/createApp.js";
import { composeProduction } from "../../server/composeProduction.js";
import { loadApiConfig, type ApiConfig } from "../../config.js";
import { v1Routes } from "../../routes/v1.js";

export interface RunningHttpServer {
  app: any;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export async function startRealHttpServer(port = 3005): Promise<RunningHttpServer> {
  const config = loadApiConfig();
  config.nodeEnv = "test";
  config.server.host = "127.0.0.1";
  config.server.port = port;
  config.security.rateLimit.max = 1000000; // Unlimited for load testing

  // Verify DB safety
  const dbUrl = config.database.url;
  const parsed = new URL(dbUrl);
  const safeHosts = ["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"];
  if (!safeHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error(`[SAFETY GATE VIOLATION] Refusing to start server against remote database: ${parsed.hostname}`);
  }

  const { v1Options, close: closeProd } = await composeProduction(config);
  const app = createApp({ config });
  await app.register(v1Routes, v1Options);

  await app.listen({ host: "127.0.0.1", port });
  const actualAddress = app.server.address();
  const actualPort = typeof actualAddress === "object" && actualAddress !== null ? actualAddress.port : port;
  const url = `http://127.0.0.1:${actualPort}`;

  console.log(`[HTTP Server] Fastify listening on real TCP socket: ${url}`);

  return {
    app,
    port: actualPort,
    url,
    close: async () => {
      console.log(`[HTTP Server] Closing server on port ${actualPort}...`);
      await app.close();
      await closeProd();
    },
  };
}
