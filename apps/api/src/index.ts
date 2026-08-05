/**
 * AVANA API — Library entry point.
 *
 * Exports createApp, startApi, and startApiWithDb for programmatic use.
 *
 * For local development, use `dev.ts` which wires Drizzle-backed stores
 * and starts the server.
 *
 * PR5-B1: Added startApiWithDb for production deployments using
 * the composeProduction composition root.
 */

import { loadApiConfig } from "./config.js";
import { createApp } from "./server/createApp.js";
import { composeProduction } from "./server/composeProduction.js";
import { v1Routes } from "./routes/v1.js";

export { type ApiConfig } from "./config.js";
export { createApp } from "./server/createApp.js";

/**
 * Start the API server with optional V1 route options (stores).
 *
 * The caller provides their own composition root (stores wired via v1Options).
 * For database-backed composition, use startApiWithDb instead.
 *
 * For local development, see `dev.ts`.
 */
export async function startApi(
  v1Options?: Parameters<typeof v1Routes>[1],
): Promise<ReturnType<typeof createApp>> {
  const config = loadApiConfig();
  const app = createApp({ config });
  if (v1Options) {
    void app.register(v1Routes, v1Options);
  } else {
    void app.register(v1Routes);
  }
  await app.listen({ host: config.server.host, port: config.server.port });
  return app;
}

/**
 * Start the API server with Drizzle-backed stores.
 *
 * Uses composeProduction to wire all stores with PostgreSQL via Drizzle ORM.
 * Intended for production deployments where the database is available.
 */
export async function startApiWithDb(): Promise<ReturnType<typeof createApp>> {
  const config = loadApiConfig();
  const { v1Options, close } = await composeProduction(config);
  const app = createApp({ config });
  void app.register(v1Routes, v1Options);

  // Graceful shutdown — close DB pool on server stop
  app.addHook("onClose", async () => {
    await close();
  });

  await app.listen({ host: config.server.host, port: config.server.port });
  return app;
}
