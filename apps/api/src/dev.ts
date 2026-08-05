/**
 * Development server entry point.
 *
 * Wires Drizzle-backed stores and starts the API server.
 *
 * PR5-B1: Switched from in-memory to Drizzle-backed stores as default.
 * In-memory stores (composeLocalDev) are preserved for test use only.
 *
 * This file is only used for local development (npm run dev).
 * It is excluded from the production build via tsconfig.build.json.
 */

import { loadApiConfig } from "./config.js";
import { createApp } from "./server/createApp.js";
import { v1Routes } from "./routes/v1.js";
import { composeProduction } from "./server/composeProduction.js";

async function main(): Promise<void> {
  const config = loadApiConfig();

  if (config.nodeEnv !== "development") {
    process.stderr.write(
      `dev.ts should only be used in development mode. NODE_ENV=${config.nodeEnv}\n`,
    );
    process.exit(1);
  }

  // Await composition so seed completes before routes are registered
  const { v1Options, close } = await composeProduction(config);

  const app = createApp({ config });
  void app.register(v1Routes, v1Options);

  // Graceful shutdown — close DB pool on server stop
  app.addHook("onClose", async () => {
    await close();
  });

  await app.listen({ host: config.server.host, port: config.server.port });
  app.log.info(
    `AVANA API running at http://${config.server.host}:${config.server.port}`,
  );
}

main().catch((err) => {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`Failed to start development server: ${message}\n`);
  process.exit(1);
});
