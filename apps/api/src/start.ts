/**
 * AVANA API — Production Entrypoint.
 *
 * Boots the Fastify server using startApiWithDb() with full PostgreSQL
 * backing and production composition root.
 */

import { startApiWithDb } from "./index.js";

async function main(): Promise<void> {
  const app = await startApiWithDb();

  const shutdown = async (signal: string) => {
    process.stdout.write(`\n[api] Received ${signal}. Shutting down gracefully...\n`);
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[api] Error during shutdown: ${String(err)}\n`);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[api] FATAL: Failed to start server: ${message}\n`);
  process.exit(1);
});
