/**
 * ArvanCloudModelGateway — Official ArvanCloud AI Gateway provider (OpenAI-compatible Chat Completions).
 *
 * Conforms to the official ArvanCloud AI architecture:
 *
 * 1. Machine User API Key:
 *    - Independent Machine User credential.
 *    - Used in the Authorization Header.
 *
 * 2. Model Gateway Endpoint:
 *    - Dedicated Gateway Base URL from panel.
 *    - Chat completion endpoint is appended with the standard chat completions path.
 *
 * Request Contract:
 *   HTTP POST to the configured completions endpoint.
 *   Authorization header set with the machine user key.
 *   Content-Type set to application/json.
 *
 * Key features:
 * - Decouples Machine User API Key from the Gateway Base URL.
 * - Formats Authorization header with configured auth scheme.
 * - Appends chat completions path directly to the configured Model Gateway Base URL.
 * - Redacts all API keys, tokens, and gateway identifiers in logs and errors (zero leakage guarantee).
 * - Native global fetch with no unnecessary heavy SDK dependencies.
 * - Supports structured JSON generation and response parsing with markdown code fence normalization.
 * - Extracts token usage (prompt_tokens, completion_tokens) and model information.
 * - Distinguishes 429 rate limits, 401 auth errors, 403 forbidden, timeouts, network errors, and server errors.
 * - Detects ArvanCloud Edge CDN firewall / IP geo-restriction block pages and reports clear diagnostics.
 * - Controlled transient retry for 50x server errors.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";

export const DEFAULT_ARVANCLOUD_MODEL = "DeepSeek-V4-Flash";
export const DEFAULT_ARVANCLOUD_BASE_URL = "https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash";
export const ARVANCLOUD_API_CHAT_URL = "https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash/chat/completions";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;

export interface ArvanCloudModelGatewayOptions {
  /** Machine User API Key for Authorization header. */
  apiKey?: string;
  /** Configured ArvanCloud model (defaults to DeepSeek-V4-Flash). */
  modelName?: string;
  /** Model Gateway Base URL from panel (defaults to https://arvancloudai.ir/gateway/models/DeepSeek-V4-Flash). */
  baseUrl?: string;
  /** Authorization scheme (defaults to "apikey"). */
  authScheme?: string;
  /** Request timeout in milliseconds (defaults to 180,000ms). */
  timeoutMs?: number;
  /** Custom fetch implementation for unit testing. */
  fetchFn?: typeof fetch;
}

/**
 * Robust JSON cleaner and parser for ArvanCloud responses.
 * Normalizes markdown code fences (```json ... ```) and trims whitespace.
 */
export function cleanAndParseArvanCloudJson<T = unknown>(rawText: string): T {
  let text = rawText.trim();

  // Strip markdown code fences (e.g. ```json ... ``` or ``` ... ```)
  const codeBlockMatch =
    text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i) ||
    text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    text = codeBlockMatch[1].trim();
  } else {
    // If not in code fence, locate first JSON object or array boundary
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");

    if (
      firstBracket !== -1 &&
      lastBracket !== -1 &&
      lastBracket > firstBracket &&
      (firstBrace === -1 || firstBracket < firstBrace)
    ) {
      text = text.slice(firstBracket, lastBracket + 1).trim();
    } else if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1).trim();
    }
  }

  // Attempt 1: Standard JSON parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // Attempt 2: Remove trailing commas before object/array close
    try {
      const noTrailing = text.replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(noTrailing) as T;
    } catch (parseErr) {
      throw new DomainError(
        "unprocessable",
        `ArvanCloud returned invalid JSON output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      );
    }
  }
}

/**
 * Constructs the final Chat Completions endpoint URL given the Model Gateway Base URL.
 * Appends /chat/completions directly to the base URL.
 */
export function buildArvanCloudChatUrl(rawBaseUrl: string): string {
  const url = rawBaseUrl.trim().replace(/\/+$/, "");
  if (url.endsWith("/chat/completions")) {
    return url;
  }
  return `${url}/chat/completions`;
}

export class ArvanCloudModelGateway implements ModelGateway {
  readonly provider = "arvancloud" as const;
  private readonly rawApiKey: string;
  private readonly cleanApiKey: string;
  private readonly modelName: string;
  private readonly baseUrl: string;
  private readonly chatUrl: string;
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  get model(): string {
    return this.modelName;
  }

  constructor(options: ArvanCloudModelGatewayOptions = {}) {
    const key =
      options.apiKey?.trim() ||
      process.env.ARVANCLOUD_API_KEY?.trim() ||
      process.env.ARVANCLOUD_API_TOKEN?.trim() ||
      "";

    if (!key) {
      throw new DomainError(
        "unprocessable",
        "ARVANCLOUD_API_KEY is required when AI_PRIMARY_PROVIDER is 'arvancloud'",
      );
    }

    this.rawApiKey = key;
    this.cleanApiKey = key.replace(/^(?:apikey|bearer)\s+/i, "").trim();

    this.modelName =
      options.modelName?.trim() ||
      process.env.ARVANCLOUD_MODEL?.trim() ||
      DEFAULT_ARVANCLOUD_MODEL;

    const rawBaseUrl =
      options.baseUrl?.trim() ||
      process.env.ARVANCLOUD_BASE_URL?.trim() ||
      DEFAULT_ARVANCLOUD_BASE_URL;

    this.baseUrl = rawBaseUrl.replace(/\/+$/, "");
    this.chatUrl = buildArvanCloudChatUrl(this.baseUrl);

    // Determine authorization header format: default is "apikey <MACHINE_USER_API_KEY>"
    const configuredScheme =
      options.authScheme?.trim() ||
      process.env.ARVANCLOUD_AUTH_SCHEME?.trim() ||
      "";

    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith("bearer ") || lowerKey.startsWith("apikey ")) {
      this.authHeader = key;
    } else if (configuredScheme) {
      this.authHeader = `${configuredScheme} ${this.cleanApiKey}`;
    } else {
      // Official ArvanCloud contract uses "apikey <MACHINE_USER_API_KEY>"
      this.authHeader = `apikey ${this.cleanApiKey}`;
    }

    const rawTimeout = options.timeoutMs ?? (process.env.ARVANCLOUD_TIMEOUT_MS ? Number(process.env.ARVANCLOUD_TIMEOUT_MS) : undefined);
    this.timeoutMs = rawTimeout && Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Helper to sanitize text by redacting API key, clean key, and URL gateway identifiers.
   */
  private sanitize(str: string): string {
    if (!str) return str;
    let sanitized = str;
    if (this.rawApiKey) {
      sanitized = sanitized.split(this.rawApiKey).join("[REDACTED]");
    }
    if (this.cleanApiKey) {
      sanitized = sanitized.split(this.cleanApiKey).join("[REDACTED]");
    }
    // Redact gateway identifier pattern from URLs: /models/<model>/<gateway_id>/v1
    sanitized = sanitized.replace(
      /(models\/[^/]+\/)([^/]+)(\/v1)/g,
      "$1[REDACTED]$3",
    );
    return sanitized;
  }

  /**
   * Execute a completion request against ArvanCloud's Chat Completions API.
   */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    // 1. Convert messages into standard OpenAI chat format
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [];

    if (req.messages && req.messages.length > 0) {
      for (const msg of req.messages) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    } else {
      messages.push({
        role: "user",
        content: "Generate structured study content.",
      });
    }

    // 2. Build ArvanCloud Chat Completion request body
    const requestBody: Record<string, unknown> = {
      model: this.modelName,
      messages,
      temperature: req.temperature ?? 0.7,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    };

    if (req.jsonSchema) {
      requestBody.response_format = { type: "json_object" };
    }

    let responseText = "";
    let lastStatusCode = 0;
    let lastStatusText = "";
    const rateLimitHeaders: Record<string, string> = {};
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptController = new AbortController();
      const attemptTimer = setTimeout(
        () => attemptController.abort(),
        this.timeoutMs,
      );

      try {
        const response = await this.fetchFn(this.chatUrl, {
          method: "POST",
          headers: {
            "Authorization": this.authHeader,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(requestBody),
          signal: attemptController.signal,
        });

        lastStatusCode = response.status;
        lastStatusText = response.statusText;
        responseText = await response.text();

        // Capture rate-limit headers if available
        if (response.headers && typeof response.headers.forEach === "function") {
          response.headers.forEach((val, key) => {
            if (
              key.toLowerCase().startsWith("x-ratelimit") ||
              key.toLowerCase() === "retry-after"
            ) {
              rateLimitHeaders[key.toLowerCase()] = val;
            }
          });
        }
      } catch (fetchErr) {
        clearTimeout(attemptTimer);
        if (attemptController.signal.aborted) {
          throw new DomainError(
            "unprocessable",
            `ArvanCloud API request timed out after ${this.timeoutMs}ms`,
          );
        }
        if (attempt < maxRetries) {
          const waitSec = (attempt + 1) * 2;
          process.stdout.write(
            `[arvancloud-gateway] Network notice (attempt ${attempt + 1}): ${this.sanitize(String(fetchErr))}. Retrying in ${waitSec}s...\n`,
          );
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        const sanitizedErr = this.sanitize(
          fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        );
        throw new DomainError(
          "unprocessable",
          `ArvanCloud API network error: ${sanitizedErr}`,
        );
      } finally {
        clearTimeout(attemptTimer);
      }

      if (lastStatusCode >= 200 && lastStatusCode < 300) {
        break;
      }

      // Handle transient server errors (500, 502, 503, 504)
      const isTransientServerError =
        lastStatusCode === 500 ||
        lastStatusCode === 502 ||
        lastStatusCode === 503 ||
        lastStatusCode === 504;

      if (isTransientServerError && attempt < maxRetries) {
        const waitSec = (attempt + 1) * 2;
        process.stdout.write(
          `[arvancloud-gateway] Transient HTTP ${lastStatusCode} (attempt ${attempt + 1}). Retrying in ${waitSec}s...\n`,
        );
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }

      // Format error details safely
      let errorDetails = `HTTP ${lastStatusCode} ${lastStatusText}`;
      try {
        const errData = JSON.parse(responseText) as {
          error?: { message?: string; type?: string; code?: string };
        };
        if (errData?.error?.message) {
          errorDetails = errData.error.message;
        }
      } catch {
        if (
          responseText.includes("The request has been blocked from your IP") ||
          responseText.includes("مسدود کرده است")
        ) {
          errorDetails =
            "The request was blocked by ArvanCloud CDN edge firewall / IP geo-restriction. Ensure your server IP is permitted in ArvanCloud firewall settings.";
        } else if (responseText.trim().length > 0) {
          errorDetails = responseText
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 300);
        }
      }

      const sanitizedMessage = this.sanitize(errorDetails);

      if (lastStatusCode === 429) {
        const retryAfter =
          rateLimitHeaders["retry-after"] ||
          (rateLimitHeaders["x-ratelimit-reset-requests"]
            ? `${rateLimitHeaders["x-ratelimit-reset-requests"]}s`
            : "");
        const retryNotice = retryAfter ? ` (retry after ${retryAfter})` : "";
        throw new DomainError(
          "rate_limit_exceeded",
          `ArvanCloud API rate limit exceeded${retryNotice}: ${sanitizedMessage}`,
        );
      }

      if (lastStatusCode === 401) {
        throw new DomainError(
          "unprocessable",
          `ArvanCloud API authentication failed (401 Unauthorized): ${sanitizedMessage}`,
        );
      }

      if (lastStatusCode === 403) {
        throw new DomainError(
          "unprocessable",
          `ArvanCloud API access forbidden (403 Forbidden): ${sanitizedMessage}`,
        );
      }

      throw new DomainError(
        "unprocessable",
        `ArvanCloud API request failed (${lastStatusCode}): ${sanitizedMessage}`,
      );
    }

    // 3. Parse ArvanCloud response envelope
    let data: {
      id?: string;
      model?: string;
      choices?: Array<{
        index?: number;
        message?: {
          role?: string;
          content?: string;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      error?: {
        message?: string;
      };
    };

    try {
      data = JSON.parse(responseText);
    } catch (err) {
      throw new DomainError(
        "unprocessable",
        `Failed to parse ArvanCloud response JSON: ${this.sanitize(String(err))}`,
      );
    }

    if (data.error?.message) {
      throw new DomainError(
        "unprocessable",
        `ArvanCloud API returned an error: ${this.sanitize(data.error.message)}`,
      );
    }

    const choice = data.choices?.[0];
    const rawText = choice?.message?.content;

    if (!rawText || rawText.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        "ArvanCloud API returned an empty completion response",
      );
    }

    let outputText = rawText.trim();
    if (req.jsonSchema) {
      // Validate that it parses as JSON and clean markdown code fences
      const parsedObj = cleanAndParseArvanCloudJson(outputText);
      outputText = JSON.stringify(parsedObj);
    }

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const finishReason = choice?.finish_reason ?? "stop";
    const model = data.model ?? this.modelName;

    return {
      text: outputText,
      model,
      usage: {
        inputTokens,
        outputTokens,
      },
      finishReason,
    };
  }
}
