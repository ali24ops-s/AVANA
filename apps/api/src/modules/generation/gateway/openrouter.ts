/**
 * OpenRouterModelGateway — Official OpenRouter API provider for User-Facing AI (DeepSeek).
 *
 * Implements the provider-agnostic ModelGateway interface using OpenRouter's
 * OpenAI-compatible Chat Completions REST API (https://openrouter.ai/api/v1/chat/completions).
 *
 * Key guarantees:
 * - Dedicated to User-Facing AI («از آوانا بپرس»).
 * - Model: DeepSeek (defaults to deepseek/deepseek-v4-flash-0731).
 * - Provider fallback explicitly DISABLED via `provider: { allow_fallbacks: false }`.
 * - Models fallback array is strictly omitted.
 * - Zero fallback to Gemini, Cloudflare, or any other provider on error.
 * - Errors are propagated directly to the application layer.
 * - Zero API key leakage in logs, headers, or error messages.
 * - Attribution headers (HTTP-Referer, X-Title) are configurable; HTTP-Referer is omitted if not configured.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";

export const DEFAULT_OPENROUTER_USER_AI_MODEL = "deepseek/deepseek-v4-flash-0731";
export const OPENROUTER_API_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;

export interface OpenRouterModelGatewayOptions {
  /** OpenRouter API Key. */
  apiKey?: string;
  /** Configured DeepSeek model name on OpenRouter (defaults to deepseek/deepseek-v4-flash-0731). */
  modelName?: string;
  /** Optional HTTP-Referer for OpenRouter rankings/analytics (never guessed). */
  httpReferer?: string;
  /** Optional app title header (defaults to AVANA). */
  appTitle?: string;
  /** Request timeout in milliseconds (defaults to 180,000ms). */
  timeoutMs?: number;
  /** Custom fetch implementation for unit testing. */
  fetchFn?: typeof fetch;
  /** Custom sleep implementation for unit testing (defaults to real setTimeout). */
  sleepFn?: (ms: number) => Promise<void>;
}

interface OpenRouterApiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterApiChoice {
  message?: {
    role?: string;
    content?: string | null;
  };
  finish_reason?: string;
}

interface OpenRouterApiResponse {
  id?: string;
  model?: string;
  choices?: OpenRouterApiChoice[];
  usage?: OpenRouterApiUsage;
  error?: {
    message?: string;
    code?: number | string;
    metadata?: unknown;
  };
}

export class OpenRouterModelGateway implements ModelGateway {
  readonly provider = "openrouter" as const;
  readonly model: string;
  private readonly apiKey?: string;
  private readonly httpReferer?: string;
  private readonly appTitle: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: OpenRouterModelGatewayOptions = {}) {
    this.apiKey = options.apiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
    this.model =
      options.modelName?.trim() ||
      process.env.OPENROUTER_USER_AI_MODEL?.trim() ||
      process.env.OPENROUTER_MODEL?.trim() ||
      DEFAULT_OPENROUTER_USER_AI_MODEL;
    this.httpReferer =
      options.httpReferer?.trim() || process.env.OPENROUTER_HTTP_REFERER?.trim() || undefined;
    this.appTitle =
      options.appTitle?.trim() || process.env.OPENROUTER_TITLE?.trim() || "AVANA";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.sleepFn = options.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Sanitizes sensitive text (e.g. API keys) from error messages and logs.
   */
  private redactSecrets(text: string): string {
    if (!this.apiKey || this.apiKey.length === 0) {
      return text;
    }
    return text.replaceAll(this.apiKey, "[REDACTED_OPENROUTER_API_KEY]");
  }

  /**
   * Calculate exponential backoff with jitter for transient retries.
   * delay = min(maxMs, baseMs * 2^attempt + jitter)
   */
  private calculateBackoffMs(attempt: number, baseMs = 1000, maxMs = 10000): number {
    const exponential = baseMs * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 500);
    return Math.min(maxMs, exponential + jitter);
  }

  /**
   * Execute model completion via OpenRouter Chat Completions endpoint.
   */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.apiKey || this.apiKey.length === 0) {
      throw new DomainError(
        "unprocessable",
        "OPENROUTER_API_KEY is required for user-facing AI service",
      );
    }

    const messages = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Construct strict request payload:
    // 1. model: exact DeepSeek model
    // 2. provider: { allow_fallbacks: false } to prevent OpenRouter provider failovers
    // 3. Strictly NO `models` array (no multi-model fallback)
    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      provider: {
        allow_fallbacks: false,
      },
    };

    if (req.temperature !== undefined) {
      payload.temperature = req.temperature;
    }
    if (req.maxTokens !== undefined) {
      payload.max_tokens = req.maxTokens;
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": this.appTitle,
    };

    // Only set HTTP-Referer if an explicit domain was provided from environment/config
    if (this.httpReferer) {
      headers["HTTP-Referer"] = this.httpReferer;
    }

    const maxTotalAttempts = 3;

    for (let attempt = 0; attempt < maxTotalAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      let response: Response;
      try {
        response = await this.fetchFn(OPENROUTER_API_CHAT_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        const isTimeout =
          (err instanceof Error && err.name === "AbortError") ||
          controller.signal.aborted;
        const rawMsg = isTimeout
          ? `OpenRouter request timed out after ${this.timeoutMs}ms`
          : (err instanceof Error ? err.message : String(err));
        const safeMsg = this.redactSecrets(rawMsg);

        if (attempt < maxTotalAttempts - 1) {
          const delayMs = this.calculateBackoffMs(attempt);
          await this.sleepFn(delayMs);
          continue;
        }

        throw new DomainError(
          "service_unavailable",
          isTimeout
            ? `OpenRouter request timed out after ${this.timeoutMs}ms`
            : `OpenRouter network error: ${safeMsg}`,
        );
      } finally {
        clearTimeout(timeoutId);
      }

      let responseBodyText = "";
      try {
        responseBodyText = await response.text();
      } catch (readErr: unknown) {
        const readMsg = readErr instanceof Error ? readErr.message : String(readErr);
        const safeMsg = this.redactSecrets(readMsg);

        if (attempt < maxTotalAttempts - 1) {
          const delayMs = this.calculateBackoffMs(attempt);
          await this.sleepFn(delayMs);
          continue;
        }

        throw new DomainError(
          "service_unavailable",
          `Failed to read OpenRouter response: ${safeMsg}`,
        );
      }

      let parsedResponse: OpenRouterApiResponse | null = null;
      try {
        parsedResponse = JSON.parse(responseBodyText) as OpenRouterApiResponse;
      } catch {
        // If response is not JSON, handle based on status code
      }

      if (!response.ok) {
        const errorMessage =
          parsedResponse?.error?.message ||
          (responseBodyText.length > 0
            ? responseBodyText.slice(0, 300)
            : response.statusText);
        const safeError = this.redactSecrets(errorMessage);

        // Non-retryable client errors -> fail immediately on attempt 0
        if (response.status === 401 || response.status === 403) {
          throw new DomainError(
            "unauthorized",
            `OpenRouter authentication failed (HTTP ${response.status}): ${safeError}`,
          );
        }

        if (response.status === 429) {
          throw new DomainError(
            "rate_limit_exceeded",
            `OpenRouter rate limit exceeded (HTTP 429): ${safeError}`,
          );
        }

        if (response.status === 400 || response.status === 422) {
          throw new DomainError(
            "bad_request",
            `OpenRouter request rejected (HTTP ${response.status}): ${safeError}`,
          );
        }

        // Retryable server errors: 500, 502, 503, 504
        if (
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504
        ) {
          if (attempt < maxTotalAttempts - 1) {
            const delayMs = this.calculateBackoffMs(attempt);
            await this.sleepFn(delayMs);
            continue;
          }

          throw new DomainError(
            "service_unavailable",
            `OpenRouter service unavailable (HTTP ${response.status}): ${safeError}`,
          );
        }

        // Other non-2xx status codes (treat as unprocessable, fail immediately)
        throw new DomainError(
          "unprocessable",
          `OpenRouter request failed (HTTP ${response.status}): ${safeError}`,
        );
      }

      if (!parsedResponse) {
        throw new DomainError(
          "unprocessable",
          "OpenRouter returned invalid non-JSON response payload",
        );
      }

      if (parsedResponse.error) {
        const safeError = this.redactSecrets(
          parsedResponse.error.message || "Unknown error from OpenRouter",
        );
        throw new DomainError(
          "unprocessable",
          `OpenRouter returned error: ${safeError}`,
        );
      }

      const firstChoice = parsedResponse.choices?.[0];
      const textContent = firstChoice?.message?.content;

      if (typeof textContent !== "string") {
        throw new DomainError(
          "unprocessable",
          "OpenRouter response contained no text content in choices",
        );
      }

      return {
        text: textContent,
        model: parsedResponse.model || this.model,
        usage: {
          inputTokens: parsedResponse.usage?.prompt_tokens ?? 0,
          outputTokens: parsedResponse.usage?.completion_tokens ?? 0,
        },
        finishReason: firstChoice?.finish_reason || "stop",
      };
    }

    throw new DomainError(
      "service_unavailable",
      "OpenRouter request exhausted all retries",
    );
  }
}
