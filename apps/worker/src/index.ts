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
import { FallbackModelGateway } from "@avana/api/generation/gateway";

async function main(): Promise<void> {
  const config = loadWorkerConfig();

  // Safe startup diagnostics — NEVER logs the actual API key
  process.stdout.write(`[worker] AI provider: ${config.generation.aiProvider}\n`);
  if (config.generation.aiProvider === "gapgpt") {
    process.stdout.write(`[worker] GapGPT model: ${config.generation.gapgptModel}\n`);
    const hasKey = Boolean(
      config.generation.gapgptApiKey &&
        config.generation.gapgptApiKey.trim().length > 0,
    );
    process.stdout.write(`[worker] GapGPT API key configured: ${hasKey}\n`);

    if (!hasKey) {
      throw new Error(
        "Configuration error: AI_PRIMARY_PROVIDER is set to 'gapgpt' but GAPGPT_API_KEY is missing or empty. Cannot start worker.",
      );
    }
  } else if (config.generation.aiProvider === "gemini") {
    process.stdout.write(`[worker] Gemini model: ${config.generation.geminiModel}\n`);
    const hasKey = Boolean(
      (config.generation.geminiApiKey &&
        config.generation.geminiApiKey.trim().length > 0) ||
      (config.generation.geminiApiKeys &&
        config.generation.geminiApiKeys.length > 0),
    );
    process.stdout.write(`[worker] Gemini API key configured: ${hasKey}\n`);

    if (!hasKey) {
      throw new Error(
        "Configuration error: AI_PROVIDER is set to 'gemini' but GEMINI_API_KEY is missing or empty. Cannot start worker.",
      );
    }
  } else if (config.generation.aiProvider === "groq") {
    process.stdout.write(`[worker] Groq model: ${config.generation.groqModel}\n`);
    const hasKey = Boolean(
      config.generation.groqApiKey &&
        config.generation.groqApiKey.trim().length > 0,
    );
    process.stdout.write(`[worker] Groq API key configured: ${hasKey}\n`);

    if (!hasKey) {
      throw new Error(
        "Configuration error: AI_PROVIDER is set to 'groq' but GROQ_API_KEY is missing or empty. Cannot start worker.",
      );
    }
  } else if (config.generation.aiProvider === "arvancloud") {
    process.stdout.write(`[worker] ArvanCloud model: ${config.generation.arvancloudModel}\n`);
    const hasKey = Boolean(
      config.generation.arvancloudApiKey &&
        config.generation.arvancloudApiKey.trim().length > 0,
    );
    process.stdout.write(`[worker] ArvanCloud API key configured: ${hasKey}\n`);

    if (!hasKey) {
      throw new Error(
        "Configuration error: AI_PRIMARY_PROVIDER is set to 'arvancloud' but ARVANCLOUD_API_KEY is missing or empty. Cannot start worker.",
      );
    }
  }

  const deps = await composeWorker(config);

  if (config.generation.enableFallback) {
    if (deps.gateway instanceof FallbackModelGateway && deps.gateway.gateways.length > 1) {
      const fallbackList = deps.gateway.gateways
        .slice(1)
        .map((g) => g.provider)
        .join(" -> ");
      process.stdout.write(`[worker] Fallback chain: ${fallbackList}\n`);
    } else {
      process.stdout.write(`[worker] Fallback: enabled (single provider active)\n`);
    }
  } else {
    process.stdout.write(`[worker] Fallback: disabled\n`);
  }

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
