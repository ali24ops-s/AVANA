/**
 * ModelGateway factory (PR6-4 & Multi-Provider Fallback Architecture).
 *
 * Selects the provider from configuration and constructs a resilient fallback chain:
 * Primary: Gemini (Priority 1) -> Fallback 1: GapGPT (Priority 2) -> Fallback 2: Groq (Priority 3) -> [Additional Fallbacks]
 *
 * When multiple providers are available, wraps them in a `FallbackModelGateway`.
 * If a single provider is available or configured, returns that provider directly.
 */

import { DomainError } from "@avana/domain";
import { MockModelGateway } from "./mock.js";
import { GeminiModelGateway } from "./gemini.js";
import {
  CloudflareModelGateway,
  DEFAULT_CLOUDFLARE_AI_MODEL,
} from "./cloudflare.js";
import { GroqModelGateway, DEFAULT_GROQ_MODEL } from "./groq.js";
import {
  GapGPTModelGateway,
  DEFAULT_GAPGPT_MODEL,
  DEFAULT_GAPGPT_BASE_URL,
} from "./gapgpt.js";
import {
  ArvanCloudModelGateway,
  DEFAULT_ARVANCLOUD_MODEL,
  DEFAULT_ARVANCLOUD_BASE_URL,
} from "./arvancloud.js";
import { FallbackModelGateway } from "./fallback.js";
import type { ModelGateway } from "./types.js";

export type { ModelGateway, ModelProvider } from "./types.js";
export type { CompletionRequest, CompletionResult } from "./types.js";
export { MockModelGateway } from "./mock.js";
export { GeminiModelGateway } from "./gemini.js";
export { GeminiKeyPool } from "./gemini-key-pool.js";
export { CloudflareModelGateway, DEFAULT_CLOUDFLARE_AI_MODEL } from "./cloudflare.js";
export { GroqModelGateway, DEFAULT_GROQ_MODEL } from "./groq.js";
export {
  GapGPTModelGateway,
  DEFAULT_GAPGPT_MODEL,
  DEFAULT_GAPGPT_BASE_URL,
  GAPGPT_API_CHAT_URL,
  cleanAndParseGapGPTJson,
} from "./gapgpt.js";
export {
  ArvanCloudModelGateway,
  DEFAULT_ARVANCLOUD_MODEL,
  DEFAULT_ARVANCLOUD_BASE_URL,
  ARVANCLOUD_API_CHAT_URL,
  cleanAndParseArvanCloudJson,
  buildArvanCloudChatUrl,
} from "./arvancloud.js";
export { FallbackModelGateway } from "./fallback.js";

/**
 * Options for configuring ModelGateway instantiation.
 */
export interface CreateModelGatewayOptions {
  provider?: string;
  enableFallback?: boolean;
  disableFallback?: boolean;
  geminiApiKey?: string;
  geminiApiKeys?: string[];
  geminiModel?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  cloudflareAiModel?: string;
  groqApiKey?: string;
  groqModel?: string;
  gapgptApiKey?: string;
  gapgptBaseUrl?: string;
  gapgptModel?: string;
  arvancloudApiKey?: string;
  arvancloudApiToken?: string;
  arvancloudBaseUrl?: string;
  arvancloudModel?: string;
  arvancloudAuthScheme?: string;
  arvancloudTimeoutMs?: number;
}

/**
 * Ordered list of all supported real AI providers.
 * Primary: Gemini -> Fallback 1: GapGPT -> Fallback 2: Groq -> ArvanCloud -> Cloudflare.
 */
export const DEFAULT_PROVIDER_PRIORITY: readonly string[] = [
  "gemini",
  "gapgpt",
  "groq",
  "arvancloud",
  "cloudflare",
] as const;

/**
 * Create a ModelGateway based on the configured provider and fallback chain.
 *
 * @param providerOrOptions Provider ID or options object. Defaults to Gemini as primary.
 * @param apiKey            Optional API key for real providers.
 * @param model             Optional model override.
 */
export function createModelGateway(
  providerOrOptions?: string | CreateModelGatewayOptions,
  apiKey?: string,
  model?: string,
): ModelGateway {
  let provider: string | undefined;
  let key: string | undefined = apiKey;
  let keysOption: string[] | undefined;
  let modelName: string | undefined = model;
  let cfAccountId: string | undefined;
  let cfApiToken: string | undefined;
  let cfModel: string | undefined;
  let groqApiKeyOption: string | undefined;
  let groqModelOption: string | undefined;
  let gapgptApiKeyOption: string | undefined;
  let gapgptBaseUrlOption: string | undefined;
  let gapgptModelOption: string | undefined;
  let arvancloudApiKeyOption: string | undefined;
  let arvancloudBaseUrlOption: string | undefined;
  let arvancloudModelOption: string | undefined;
  let arvancloudAuthSchemeOption: string | undefined;
  let arvancloudTimeoutMsOption: number | undefined;
  let explicitFallbackOption: boolean | undefined;

  if (typeof providerOrOptions === "object" && providerOrOptions !== null) {
    provider = providerOrOptions.provider;
    key = providerOrOptions.geminiApiKey ?? key;
    keysOption = providerOrOptions.geminiApiKeys;
    modelName = providerOrOptions.geminiModel ?? modelName;
    cfAccountId = providerOrOptions.cloudflareAccountId;
    cfApiToken = providerOrOptions.cloudflareApiToken;
    cfModel = providerOrOptions.cloudflareAiModel;
    groqApiKeyOption = providerOrOptions.groqApiKey;
    groqModelOption = providerOrOptions.groqModel;
    gapgptApiKeyOption = providerOrOptions.gapgptApiKey;
    gapgptBaseUrlOption = providerOrOptions.gapgptBaseUrl;
    gapgptModelOption = providerOrOptions.gapgptModel;
    arvancloudApiKeyOption =
      providerOrOptions.arvancloudApiToken ||
      providerOrOptions.arvancloudApiKey;
    arvancloudBaseUrlOption = providerOrOptions.arvancloudBaseUrl;
    arvancloudModelOption = providerOrOptions.arvancloudModel;
    arvancloudAuthSchemeOption = providerOrOptions.arvancloudAuthScheme;
    arvancloudTimeoutMsOption = providerOrOptions.arvancloudTimeoutMs;
    if (providerOrOptions.enableFallback !== undefined) {
      explicitFallbackOption = providerOrOptions.enableFallback;
    } else if (providerOrOptions.disableFallback !== undefined) {
      explicitFallbackOption = !providerOrOptions.disableFallback;
    }
  } else {
    provider = providerOrOptions;
  }

  const shouldEnableFallback =
    explicitFallbackOption !== undefined
      ? explicitFallbackOption
      : process.env.AI_ENABLE_FALLBACK === "true";

  const requestedProvider = (
    provider ||
    process.env.AI_PRIMARY_PROVIDER ||
    process.env.AI_CONTENT_PROVIDER ||
    process.env.AI_PROVIDER ||
    "gemini"
  ).toLowerCase();

  if (requestedProvider === "mock") {
    return new MockModelGateway();
  }

  // Build provider evaluation order:
  // If fallback is disabled, ONLY evaluate the single requested primary provider.
  // If fallback is enabled, evaluate the full priority chain starting with requested primary.
  const orderedProviders: string[] = shouldEnableFallback
    ? [
        requestedProvider,
        ...DEFAULT_PROVIDER_PRIORITY.filter((p) => p !== requestedProvider),
      ]
    : [requestedProvider];

  const instantiatedGateways: ModelGateway[] = [];

  for (const p of orderedProviders) {
    if (p === "gapgpt") {
      const resolvedApiKey =
        gapgptApiKeyOption ||
        (requestedProvider === "gapgpt" ? key : undefined) ||
        process.env.GAPGPT_API_KEY;

      if (resolvedApiKey && resolvedApiKey.trim().length > 0) {
        const resolvedBaseUrl =
          gapgptBaseUrlOption ||
          process.env.GAPGPT_BASE_URL ||
          DEFAULT_GAPGPT_BASE_URL;

        const resolvedModel =
          gapgptModelOption ||
          (requestedProvider === "gapgpt" ? modelName : undefined) ||
          process.env.GAPGPT_MODEL ||
          DEFAULT_GAPGPT_MODEL;

        instantiatedGateways.push(
          new GapGPTModelGateway({
            apiKey: resolvedApiKey.trim(),
            baseUrl: resolvedBaseUrl.trim(),
            modelName: resolvedModel.trim(),
          }),
        );
      }
    } else if (p === "gemini") {
      let resolvedKeys: string[] = keysOption ? [...keysOption] : [];
      if (
        resolvedKeys.length === 0 &&
        (requestedProvider === "gemini" ? key : undefined) &&
        key &&
        key.trim().length > 0
      ) {
        resolvedKeys.push(key.trim());
      }
      if (resolvedKeys.length === 0) {
        const envKeys = [
          ...(process.env.GEMINI_API_KEYS
            ? process.env.GEMINI_API_KEYS.split(",")
            : []),
          process.env.GEMINI_API_KEY_1,
          process.env.GEMINI_API_KEY_2,
          process.env.GEMINI_API_KEY,
        ].filter((k): k is string => Boolean(k && k.trim().length > 0));
        resolvedKeys = envKeys;
      }

      if (resolvedKeys.length > 0) {
        const resolvedModel =
          (requestedProvider === "gemini" ? modelName : undefined) ||
          process.env.GEMINI_MODEL ||
          "gemini-3.6-flash";

        instantiatedGateways.push(
          new GeminiModelGateway({
            apiKeys: resolvedKeys,
            modelName: resolvedModel,
          }),
        );
      }
    } else if (p === "groq") {
      const resolvedApiKey =
        groqApiKeyOption ||
        (requestedProvider === "groq" ? key : undefined) ||
        process.env.GROQ_API_KEY;

      if (resolvedApiKey && resolvedApiKey.trim().length > 0) {
        const resolvedModel =
          groqModelOption ||
          (requestedProvider === "groq" ? modelName : undefined) ||
          process.env.GROQ_MODEL ||
          DEFAULT_GROQ_MODEL;

        instantiatedGateways.push(
          new GroqModelGateway({
            apiKey: resolvedApiKey.trim(),
            modelName: resolvedModel.trim(),
          }),
        );
      }
    } else if (p === "arvancloud") {
      const resolvedApiKey =
        arvancloudApiKeyOption ||
        (requestedProvider === "arvancloud" ? key : undefined) ||
        process.env.ARVANCLOUD_API_TOKEN ||
        process.env.ARVANCLOUD_API_KEY;

      if (resolvedApiKey && resolvedApiKey.trim().length > 0) {
        const resolvedBaseUrl =
          arvancloudBaseUrlOption ||
          process.env.ARVANCLOUD_BASE_URL ||
          DEFAULT_ARVANCLOUD_BASE_URL;

        const resolvedModel =
          arvancloudModelOption ||
          (requestedProvider === "arvancloud" ? modelName : undefined) ||
          process.env.ARVANCLOUD_MODEL ||
          DEFAULT_ARVANCLOUD_MODEL;

        const resolvedAuthScheme =
          arvancloudAuthSchemeOption || process.env.ARVANCLOUD_AUTH_SCHEME;

        instantiatedGateways.push(
          new ArvanCloudModelGateway({
            apiKey: resolvedApiKey.trim(),
            baseUrl: resolvedBaseUrl.trim(),
            modelName: resolvedModel.trim(),
            authScheme: resolvedAuthScheme?.trim(),
            timeoutMs: arvancloudTimeoutMsOption,
          }),
        );
      }
    } else if (p === "cloudflare") {
      const resolvedAccountId =
        cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
      const resolvedApiToken =
        cfApiToken ||
        (requestedProvider === "cloudflare" ? key : undefined) ||
        process.env.CLOUDFLARE_API_TOKEN;

      if (
        resolvedAccountId &&
        resolvedAccountId.trim().length > 0 &&
        resolvedApiToken &&
        resolvedApiToken.trim().length > 0
      ) {
        const resolvedModel =
          cfModel ||
          (requestedProvider === "cloudflare" ? modelName : undefined) ||
          process.env.CLOUDFLARE_AI_MODEL ||
          DEFAULT_CLOUDFLARE_AI_MODEL;

        instantiatedGateways.push(
          new CloudflareModelGateway({
            accountId: resolvedAccountId.trim(),
            apiToken: resolvedApiToken.trim(),
            modelName: resolvedModel.trim(),
          }),
        );
      }
    }
  }

  // If no gateways could be instantiated, throw domain error for requested provider
  if (instantiatedGateways.length === 0) {
    if (requestedProvider === "gapgpt") {
      throw new DomainError(
        "unprocessable",
        "GAPGPT_API_KEY is required when AI_PROVIDER is 'gapgpt'",
      );
    }
    if (requestedProvider === "gemini") {
      throw new DomainError(
        "unprocessable",
        "GEMINI_API_KEY is required when AI_PROVIDER is 'gemini'",
      );
    }
    if (requestedProvider === "groq") {
      throw new DomainError(
        "unprocessable",
        "GROQ_API_KEY is required when AI_PROVIDER is 'groq'",
      );
    }
    if (requestedProvider === "arvancloud") {
      throw new DomainError(
        "unprocessable",
        "ARVANCLOUD_API_KEY or ARVANCLOUD_API_TOKEN is required when AI_PRIMARY_PROVIDER is 'arvancloud'",
      );
    }
    if (requestedProvider === "cloudflare") {
      const resolvedAccountId =
        cfAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
      if (!resolvedAccountId || resolvedAccountId.trim().length === 0) {
        throw new DomainError(
          "unprocessable",
          "CLOUDFLARE_ACCOUNT_ID is required when AI_PROVIDER is 'cloudflare'",
        );
      }
      throw new DomainError(
        "unprocessable",
        "CLOUDFLARE_API_TOKEN is required when AI_PROVIDER is 'cloudflare'",
      );
    }

    // Safety cliff: unsupported provider
    throw new DomainError(
      "unprocessable",
      `Model provider '${requestedProvider}' is not implemented yet`,
    );
  }

  // If exactly one gateway was instantiated, return it directly
  if (instantiatedGateways.length === 1) {
    return instantiatedGateways[0];
  }

  // If multiple gateways are configured, return the fallback chain
  return new FallbackModelGateway(instantiatedGateways);
}
