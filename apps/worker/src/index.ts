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

import { loadWorkerConfig } from "./config.js";
import { composeWorker } from "./compose.js";
import { createGenerationWorker } from "./processors/generation-processor.js";

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  // Safe startup diagnostics — NEVER logs the actual API key
  process.stdout.write(`[worker] AI provider: ${config.generation.aiProvider}\n`);
  if (config.generation.aiProvider === "gemini") {
    process.stdout.write(`[worker] Gemini model: ${config.generation.geminiModel}\n`);
    const hasKey = Boolean(
      config.generation.geminiApiKey &&
        config.generation.geminiApiKey.trim().length > 0,
    );
    process.stdout.write(`[worker] Gemini API key configured: ${hasKey}\n`);

    if (!hasKey) {
      throw new Error(
        "Configuration error: AI_PROVIDER is set to 'gemini' but GEMINI_API_KEY is missing or empty. Cannot start worker.",
      );
    }
  }

  const deps = await composeWorker(config);

  const worker = createGenerationWorker(
    { url: config.redis.url },
    config.generation.queueName,
    {
      generationService: deps.generationService,
      generationJobStore: deps.generationJobStore,
    },
  );

  worker.on("ready", () => {
    process.stdout.write(
      `[worker] Generation worker ready (queue="${config.generation.queueName}").\n`,
    );
  });
  worker.on("error", (err) => {
    process.stderr.write(`[worker] Worker error: ${String(err)}\n`);
  });

  const shutdown = async () => {
    process.stdout.write("[worker] Shutting down...\n");
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
