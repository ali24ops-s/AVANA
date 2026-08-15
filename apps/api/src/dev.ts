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
import { composeLocalDev } from "./server/composeLocalDev.js";
import { GenerationService } from "./modules/generation/generation-service.js";
import { createGenerationWorker } from "./modules/generation/generation-processor.js";
import { defaultPolicy } from "@avana/domain";
import type { V1RouteOptions } from "./routes/v1.js";

async function main(): Promise<void> {
  const config = loadApiConfig();

  if (config.nodeEnv !== "development") {
    process.stderr.write(
      `dev.ts should only be used in development mode. NODE_ENV=${config.nodeEnv}\n`,
    );
    process.exit(1);
  }

  // Try PostgreSQL composition; fallback to composeLocalDev if PostgreSQL is not available
  let v1Options: V1RouteOptions;
  let close: () => Promise<void>;

  try {
    const prod = await composeProduction(config);
    v1Options = prod.v1Options;
    close = prod.close;
    process.stdout.write("[dev] Connected to PostgreSQL stores.\n");
  } catch (err) {
    process.stdout.write(
      `[dev] PostgreSQL not running (${String(err)}). Starting with in-memory stores (composeLocalDev)...\n`,
    );
    const local = await composeLocalDev(config);
    v1Options = local.v1Options;
    close = async () => {};
  }

  const app = createApp({ config });

  app.addHook("onRequest", async (req) => {
    process.stdout.write(`[API REQ] ${req.method} ${req.url}\n`);
  });
  app.addHook("onResponse", async (req, reply) => {
    process.stdout.write(
      `[API RES] ${req.method} ${req.url} -> ${reply.statusCode}\n`,
    );
  });

  void app.register(v1Routes, v1Options);

  // Boot inline generation worker in dev mode so jobs are processed automatically
  let worker: ReturnType<typeof createGenerationWorker> | null = null;
  try {
    if (v1Options.generatedContentStore && v1Options.generationJobStore) {
      const generationService = new GenerationService(
        v1Options.generatedContentStore,
        v1Options.generatedContentCitationStore!,
        v1Options.gateway!,
        v1Options.documentStore!,
        v1Options.documentChunkStore!,
        defaultPolicy,
        v1Options.auditService,
        v1Options.organizationStore,
      );

      worker = createGenerationWorker(
        { url: config.redis.url },
        config.generation.queueName,
        {
          generationService,
          generationJobStore: v1Options.generationJobStore,
        },
      );

      worker.on("ready", () => {
        process.stdout.write(
          `[worker] Generation worker ready on queue "${config.generation.queueName}" (provider: ${config.generation.aiProvider}, model: ${config.generation.geminiModel})\n`,
        );
      });
      worker.on("active", (job) => {
        process.stdout.write(
          `[worker] ACTIVE: Processing job ${job.id} (name=${job.name})...\n`,
        );
      });
      worker.on("completed", (job) => {
        process.stdout.write(
          `[worker] COMPLETED: Job ${job.id} succeeded!\n`,
        );
      });
      worker.on("failed", (job, err) => {
        process.stderr.write(
          `[worker] FAILED: Job ${job?.id} failed: ${err.message}\n`,
        );
      });
      worker.on("error", (err) => {
        process.stderr.write(`[worker] Generation worker warning: ${String(err)}\n`);
      });
    }
  } catch (err) {
    process.stderr.write(
      `[dev] Could not initialize inline generation worker: ${String(err)}\n`,
    );
  }

  // Graceful shutdown — close DB pool and worker on server stop
  app.addHook("onClose", async () => {
    if (worker) {
      await worker.close();
    }
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
