/**
 * ModelGateway factory (PR6-4).
 *
 * Selects the provider from configuration. Only the `mock` provider is
 * implemented; a real provider (openai/anthropic/…) throws `unprocessable`
 * so we never silently fall back (or half-initialize) in production.
 *
 * Retry / circuit-breaker are deferred to PR6-5 workers. The ModelGateway
 * interface is designed so a decorator can wrap it later without changing
 * callers (documented TODO).
 */

import { DomainError } from "@avana/domain";
import { MockModelGateway } from "./mock.js";
import { GeminiModelGateway } from "./gemini.js";
import type { ModelGateway } from "./types.js";

export type { ModelGateway, ModelProvider } from "./types.js";
export type { CompletionRequest, CompletionResult } from "./types.js";
export { MockModelGateway } from "./mock.js";
export { GeminiModelGateway } from "./gemini.js";

/**
 * Options for configuring ModelGateway instantiation.
 */
export interface CreateModelGatewayOptions {
  provider?: string;
  geminiApiKey?: string;
  geminiModel?: string;
}

/**
 * Create a ModelGateway based on the configured provider.
 *
 * @param provider The configured provider id. `"mock"` (or unset/missing)
 *                 selects the config-gated fake provider.
 * @param apiKey   Optional API key for real providers (e.g. Gemini).
 * @param model    Optional model override.
 */
export function createModelGateway(
  providerOrOptions?: string | CreateModelGatewayOptions,
  apiKey?: string,
  model?: string,
): ModelGateway {
  let provider: string | undefined;
  let key: string | undefined = apiKey;
  let modelName: string | undefined = model;

  if (typeof providerOrOptions === "object" && providerOrOptions !== null) {
    provider = providerOrOptions.provider;
    key = providerOrOptions.geminiApiKey ?? key;
    modelName = providerOrOptions.geminiModel ?? modelName;
  } else {
    provider = providerOrOptions;
  }

  const normalized = (provider ?? "mock").toLowerCase();

  if (normalized === "mock") {
    return new MockModelGateway();
  }

  if (normalized === "gemini") {
    const resolvedKey = key || process.env.GEMINI_API_KEY;
    if (!resolvedKey || resolvedKey.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        "GEMINI_API_KEY is required when AI_PROVIDER is 'gemini'",
      );
    }
    const resolvedModel =
      modelName || process.env.GEMINI_MODEL || "gemini-3.6-flash";
    return new GeminiModelGateway({
      apiKey: resolvedKey,
      modelName: resolvedModel,
    });
  }

  // Safety cliff: an unknown or unsupported provider was configured.
  // Fail loudly rather than silently falling back to mock in production.
  throw new DomainError(
    "unprocessable",
    `Model provider '${normalized}' is not implemented yet`,
  );
}

