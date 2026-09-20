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

process.env.NODE_ENV = process.env.NODE_ENV || "development";

import { loadApiConfig } from "./config.js";
import { createApp } from "./server/createApp.js";
import { v1Routes } from "./routes/v1.js";
import { composeProduction } from "./server/composeProduction.js";
import { composeLocalDev } from "./server/composeLocalDev.js";
import { GenerationService } from "./modules/generation/generation-service.js";
import { createGenerationWorker } from "./modules/generation/generation-processor.js";
import { WalletService } from "./modules/wallet/wallet-service.js";
import { defaultPolicy, type OrganizationId } from "@avana/domain";
import type { V1RouteOptions } from "./routes/v1.js";

async function main(): Promise<void> {
  const config = loadApiConfig();

  if (config.nodeEnv !== "development") {
    process.stderr.write(
      `dev.ts should only be used in development mode. NODE_ENV=${config.nodeEnv}\n`,
    );
    process.exit(1);
  }

  // Try PostgreSQL composition; only use in-memory stores if explicitly requested via USE_IN_MEMORY_DEV
  let v1Options: V1RouteOptions;
  let close: () => Promise<void>;

  try {
    const prod = await composeProduction(config);
    // Eagerly probe database connectivity to verify PostgreSQL is actually reachable
    await prod.v1Options.userStore.findByEmail("probe@local.dev");
    v1Options = prod.v1Options;
    close = prod.close;
    process.stdout.write("[dev] Connected to PostgreSQL stores.\n");
  } catch (err) {
    if (process.env.USE_IN_MEMORY_DEV === "true") {
      process.stdout.write(
        `[dev] PostgreSQL not running (${String(err)}). Starting with in-memory stores (composeLocalDev)...\n`,
      );
      const local = await composeLocalDev(config);
      v1Options = local.v1Options;
      close = async () => {};
    } else {
      process.stderr.write(
        `[dev] FATAL: Failed to connect to PostgreSQL stores: ${String(err)}\n` +
          `PostgreSQL is the mandatory primary store. Set USE_IN_MEMORY_DEV=true only if in-memory test mode is explicitly intended.\n`,
      );
      throw err;
    }
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
      const adminGateway = v1Options.adminGateway ?? v1Options.gateway!;
      const userGateway = v1Options.gateway!;

      const adminGenerationService = new GenerationService(
        v1Options.generatedContentStore,
        v1Options.generatedContentCitationStore!,
        adminGateway,
        v1Options.documentStore!,
        v1Options.documentChunkStore!,
        defaultPolicy,
        v1Options.auditService,
        v1Options.organizationStore,
        v1Options.moduleStore,
        v1Options.lessonStore,
        v1Options.flashcardStore,
        v1Options.quizStore,
        v1Options.quizQuestionStore,
        v1Options.courseStore,
        v1Options.config.systemOrganizationId as OrganizationId,
        v1Options.generationChunkStore,
        v1Options.generationJobStore,
        v1Options.generationProgressService,
      );

      const userGenerationService = new GenerationService(
        v1Options.generatedContentStore,
        v1Options.generatedContentCitationStore!,
        userGateway,
        v1Options.documentStore!,
        v1Options.documentChunkStore!,
        defaultPolicy,
        v1Options.auditService,
        v1Options.organizationStore,
        v1Options.moduleStore,
        v1Options.lessonStore,
        v1Options.flashcardStore,
        v1Options.quizStore,
        v1Options.quizQuestionStore,
        v1Options.courseStore,
        v1Options.config.systemOrganizationId as OrganizationId,
        v1Options.generationChunkStore,
        v1Options.generationJobStore,
        v1Options.generationProgressService,
      );

      const walletService = v1Options.walletStore
        ? new WalletService(v1Options.walletStore, v1Options.auditService)
        : undefined;

      worker = createGenerationWorker(
        { url: config.redis.url },
        config.generation.queueName,
        {
          adminGenerationService,
          userGenerationService,
          generationService: userGenerationService,
          generationJobStore: v1Options.generationJobStore,
          walletService,
          walletStore: v1Options.walletStore,
        },
      );

      worker.on("ready", () => {
        process.stdout.write(
          `[worker] Generation worker ready on queue "${config.generation.queueName}" (admin: ${adminGateway.provider}/${adminGateway.model ?? "gemini"}, user: ${userGateway.provider}/${userGateway.model ?? "openrouter"})\n`,
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
