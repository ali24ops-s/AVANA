/**
 * AVANA Worker — entry point (PR6-5).
 *
 * Boots the BullMQ Worker for the `content_generate` queue. It composes the
 * same store/service/gateway stack the API uses, so the worker calls the
 * existing `GenerationService` unchanged (no duplication of generation logic).
 *
 * The worker shares the API config (database + Redis + queue name) and
 * gracefully shuts down on SIGINT/SIGTERM.
 */

process.env.NODE_ENV = process.env.NODE_ENV || "development";

import { loadWorkerConfig, type WorkerConfig } from "./config.js";
import { composeWorker } from "./compose.js";
import { createGenerationWorker } from "./processors/generation-processor.js";

export function validateWorkerConfig(config: WorkerConfig): void {
  const hasKey = Boolean(
    config.userAi.openrouterApiKey &&
      config.userAi.openrouterApiKey.trim().length > 0,
  );

  if (!hasKey) {
    throw new Error(
      "Configuration error: OPENROUTER_API_KEY is missing or empty. Cannot start worker.",
    );
  }
}

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  // Safe startup diagnostics — NEVER logs the actual API key
  process.stdout.write(`[worker] AI provider: ${config.userAi.provider}\n`);
  process.stdout.write(`[worker] AI model: ${config.userAi.openrouterModel}\n`);
  process.stdout.write(`[worker] AI fallback: disabled\n`);

  const hasKey = Boolean(
    config.userAi.openrouterApiKey &&
      config.userAi.openrouterApiKey.trim().length > 0,
  );
  process.stdout.write(`[worker] OpenRouter API key configured: ${hasKey}\n`);

  validateWorkerConfig(config);

  const deps = await composeWorker(config);

  // Startup stale reconciliation: clean up any orphaned jobs/chunks/courses from previous crashed runs
  try {
    const reconSummary = await deps.recoveryService.reconcileAllStale();
    if (
      reconSummary.recoveredJobsCount > 0 ||
      reconSummary.recoveredChunksCount > 0 ||
      reconSummary.reconciledCoursesCount > 0 ||
      reconSummary.reconciledDocumentsCount > 0
    ) {
      process.stdout.write(
        `[worker] Startup recovery reconciled: ${reconSummary.recoveredJobsCount} jobs, ${reconSummary.recoveredChunksCount} chunks, ${reconSummary.reconciledCoursesCount} courses, ${reconSummary.reconciledDocumentsCount} documents\n`,
      );
    }
  } catch (err) {
    process.stderr.write(
      `[worker] Startup recovery warning: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // Periodic background reconciliation (every 5 minutes)
  const reconcileInterval = setInterval(async () => {
    try {
      await deps.recoveryService.reconcileAllStale();
    } catch {
      // background reconciliation error suppressed
    }
  }, 300_000);


  const worker = createGenerationWorker(
    { url: config.redis.url },
    config.generation.queueName,
    {
      adminGenerationService: deps.adminGenerationService,
      userGenerationService: deps.userGenerationService,
      generationService: deps.generationService,
      generationJobStore: deps.generationJobStore,
      walletService: deps.walletService,
      walletStore: deps.walletStore,
    },
  );

  worker.on("ready", () => {
    process.stdout.write(
      `[worker] Generation worker ready (queue="${config.generation.queueName}", admin: ${deps.adminGateway.provider}, user: ${deps.userGateway.provider}).\n`,
    );
  });
  worker.on("error", (err) => {
    process.stderr.write(`[worker] Worker error: ${String(err)}\n`);
  });

  const shutdown = async () => {
    process.stdout.write("[worker] Shutting down...\n");
    clearInterval(reconcileInterval);
    await worker.close();
    await deps.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  const message =
    err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`[worker] Failed to start: ${message}\n`);
  process.exit(1);
});
