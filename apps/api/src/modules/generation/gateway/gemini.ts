/**
 * GeminiModelGateway — Real Google Gemini API provider with Multi-Key rotation & failover.
 *
 * Implements the provider-agnostic ModelGateway interface using Google's
 * Gemini REST API with Structured JSON output mode (responseMimeType: "application/json").
 *
 * Key features:
 * - Managed Multi-Key KeyPool with Round-Robin / LRU selection.
 * - Multi-Key Failover for 401 (invalid), 403 (quota/invalid), 429 (rate/quota), and 50x errors.
 * - Preserves existing single-key behavior when only 1 key is provided.
 * - Never leaks API keys in logs, URLs, error messages, or client payloads.
 * - Native global fetch (no heavy SDK dependencies required).
 * - Converts conversation messages into Gemini's systemInstruction + contents format.
 * - Extracts token usage from Gemini usageMetadata.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";
import { GeminiKeyPool, type GeminiKeySlot } from "./gemini-key-pool.js";

const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiModelGatewayOptions {
  /** Optional single API key (legacy backward compatibility). */
  apiKey?: string;
  /** Optional array of API keys. */
  apiKeys?: string[];
  /** Optional pre-configured GeminiKeyPool. */
  keyPool?: GeminiKeyPool;
  /** Configured Gemini model. */
  modelName?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
  /** Custom fetch implementation (used in unit tests). */
  fetchFn?: typeof fetch;
}

class GeminiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`HTTP ${status} ${statusText}: ${body}`);
    this.name = "GeminiHttpError";
  }
}

export class GeminiModelGateway implements ModelGateway {
  readonly provider = "gemini" as const;
  private readonly keyPool: GeminiKeyPool;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  get model(): string {
    return this.modelName;
  }

  constructor(options: GeminiModelGatewayOptions) {
    if (options.keyPool) {
      this.keyPool = options.keyPool;
    } else if (options.apiKeys && options.apiKeys.length > 0) {
      this.keyPool = new GeminiKeyPool(options.apiKeys);
    } else if (options.apiKey && options.apiKey.trim().length > 0) {
      this.keyPool = new GeminiKeyPool([options.apiKey]);
    } else {
      const envKeys = [
        ...(process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(",") : []),
        process.env.GEMINI_API_KEY_1,
        process.env.GEMINI_API_KEY_2,
        process.env.GEMINI_API_KEY,
      ].filter((k): k is string => Boolean(k && k.trim().length > 0));

      if (envKeys.length > 0) {
        this.keyPool = new GeminiKeyPool(envKeys);
      } else {
        throw new DomainError(
          "unprocessable",
          "GEMINI_API_KEY is required when AI_PROVIDER is 'gemini'",
        );
      }
    }

    this.modelName = options.modelName?.trim() || DEFAULT_GEMINI_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Helper to sanitize text by redacting all API keys managed by the pool.
   */
  private sanitize(str: string): string {
    return this.keyPool.sanitize(str);
  }

  /**
   * Classify an error to decide if key failover/switch should be executed.
   */
  private classifyError(err: unknown): {
    type: "switch" | "rethrow";
    reason?: "invalid" | "quota_exhausted" | "rate_limited";
    cooldownMs?: number;
  } {
    if (!(err instanceof GeminiHttpError)) {
      return { type: "rethrow" };
    }

    const { status, body } = err;

    // 400 Bad Request (schema or prompt error) -> keep key healthy, rethrow
    if (status === 400) {
      return { type: "rethrow" };
    }

    // 401 Unauthorized -> Invalid Key
    if (status === 401) {
      return { type: "switch", reason: "invalid" };
    }

    // 403 Forbidden -> Inspect body for quota vs permission
    if (status === 403) {
      const lower = body.toLowerCase();
      if (
        lower.includes("generaterequestsperday") ||
        lower.includes("quota") ||
        lower.includes("ratelimitexceeded") ||
        lower.includes("resource_exhausted")
      ) {
        return {
          type: "switch",
          reason: "quota_exhausted",
          cooldownMs: 24 * 60 * 60 * 1000,
        };
      }
      if (
        lower.includes("api_key_invalid") ||
        lower.includes("permission_denied") ||
        lower.includes("api key not valid")
      ) {
        return { type: "switch", reason: "invalid" };
      }
      return { type: "rethrow" };
    }

    // 429 Too Many Requests -> Inspect body for daily quota vs temporary rate limit
    if (status === 429) {
      const lower = body.toLowerCase();
      if (
        lower.includes("generaterequestsperday") ||
        lower.includes("limit: 20") ||
        lower.includes("free_tier_requests")
      ) {
        return {
          type: "switch",
          reason: "quota_exhausted",
          cooldownMs: 24 * 60 * 60 * 1000,
        };
      }
      const match = body.match(/retry in ([0-9.]+)\s*s/i);
      const cooldownSec = match && match[1] ? Math.ceil(parseFloat(match[1])) + 2 : 30;
      return {
        type: "switch",
        reason: "rate_limited",
        cooldownMs: cooldownSec * 1000,
      };
    }

    // 500 / 502 / 503 Server Errors (after internal retries failed)
    if (status === 500 || status === 502 || status === 503) {
      return {
        type: "switch",
        reason: "rate_limited",
        cooldownMs: 15_000,
      };
    }

    return { type: "rethrow" };
  }

  /**
   * Internal execution of request on a specific key with single-key transient retries.
   */
  private async executeWithKey(
    req: CompletionRequest,
    slot: GeminiKeySlot,
  ): Promise<CompletionResult> {
    // 1. Separate system instructions from conversation contents
    const systemParts: Array<{ text: string }> = [];
    const contents: Array<{
      role: "user" | "model";
      parts: Array<{ text: string }>;
    }> = [];

    for (const msg of req.messages) {
      if (msg.role === "system") {
        systemParts.push({ text: msg.content });
      } else {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    if (contents.length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: "Generate structured study content." }],
      });
    }

    // 2. Build Gemini REST API request body
    const requestBody: Record<string, unknown> = {
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: req.temperature ?? 0.2,
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      },
    };

    if (systemParts.length > 0) {
      requestBody.systemInstruction = {
        parts: systemParts,
      };
    }

    const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(this.modelName)}:generateContent`;

    let responseText = "";
    let lastStatusCode = 0;
    let lastStatusText = "";
    const maxRetriesPerKey = 2;

    for (let attempt = 0; attempt <= maxRetriesPerKey; attempt++) {
      const attemptController = new AbortController();
      const attemptTimer = setTimeout(
        () => attemptController.abort(),
        this.timeoutMs,
      );

      try {
        const response = await this.fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Connection": "close",
            "x-goog-api-key": slot.apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: attemptController.signal,
        });

        lastStatusCode = response.status;
        lastStatusText = response.statusText;
        responseText = await response.text();
      } catch (fetchErr) {
        clearTimeout(attemptTimer);
        if (attemptController.signal.aborted) {
          throw new DomainError(
            "unprocessable",
            `Gemini API request timed out after ${this.timeoutMs}ms`,
          );
        }
        if (attempt < maxRetriesPerKey) {
          const waitSec = 2 * (attempt + 1);
          process.stdout.write(
            `[gemini-gateway] Network notice on ${slot.id} (attempt ${attempt + 1}): ${this.sanitize(String(fetchErr))}. Retrying in ${waitSec}s...\n`,
          );
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        throw fetchErr;
      } finally {
        clearTimeout(attemptTimer);
      }

      if (lastStatusCode >= 200 && lastStatusCode < 300) {
        break;
      }

      // Check for transient 50x or transient 429 before exhausting single key retries
      const isTransientServerError =
        lastStatusCode === 503 || lastStatusCode === 500 || lastStatusCode === 502;

      if (isTransientServerError && attempt < maxRetriesPerKey) {
        const waitSec = 2 * (attempt + 1);
        process.stdout.write(
          `[gemini-gateway] Transient HTTP ${lastStatusCode} on ${slot.id} (attempt ${attempt + 1}). Retrying in ${waitSec}s...\n`,
        );
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }

      // Throw GeminiHttpError to trigger classification and key failover
      throw new GeminiHttpError(lastStatusCode, lastStatusText, responseText);
    }

    // Parse Gemini response structure
    let data: {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
          role?: string;
        };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
      modelVersion?: string;
    };

    try {
      data = JSON.parse(responseText);
    } catch (err) {
      throw new DomainError(
        "unprocessable",
        `Failed to parse Gemini response JSON: ${this.sanitize(String(err))}`,
      );
    }

    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const rawText = part?.text;

    if (!rawText || rawText.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        "Gemini API returned an empty completion response",
      );
    }

    const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
    const finishReason = candidate?.finishReason ?? "STOP";
    const model = data.modelVersion ?? this.modelName;

    return {
      text: rawText.trim(),
      model,
      usage: {
        inputTokens,
        outputTokens,
      },
      finishReason,
    };
  }

  /**
   * Execute a completion request against Gemini with Multi-Key Failover.
   */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const maxKeyAttempts = this.keyPool.size;
    let lastError: Error | null = null;

    for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
      let slot: GeminiKeySlot;
      try {
        slot = this.keyPool.acquireKey();
      } catch (poolErr) {
        if (lastError && poolErr instanceof DomainError && poolErr.code === "rate_limit_exceeded") {
          throw lastError;
        }
        throw poolErr;
      }

      try {
        const result = await this.executeWithKey(req, slot);
        this.keyPool.reportSuccess(slot.id);
        return result;
      } catch (err) {
        lastError = err as Error;

        const action = this.classifyError(err);
        if (action.type === "switch" && action.reason) {
          this.keyPool.reportFailure(slot.id, action.reason, action.cooldownMs);
          process.stdout.write(
            `[gemini-gateway] ${slot.id} encountered ${action.reason}. Failover switching to next key...\n`,
          );
          continue;
        }

        // Non-switch error (e.g. 400 Bad Request or parse error) -> sanitize and rethrow immediately
        if (err instanceof DomainError) {
          throw new DomainError(err.code, this.sanitize(err.message));
        }

        if (err instanceof GeminiHttpError) {
          let errorDetails = `HTTP ${err.status} ${err.statusText}`;
          try {
            const errData = JSON.parse(err.body) as { error?: { message?: string } };
            if (errData?.error?.message) {
              errorDetails = errData.error.message;
            }
          } catch {
            if (err.body.trim().length > 0) {
              errorDetails = err.body.slice(0, 300);
            }
          }
          const sanitized = this.sanitize(errorDetails);
          throw new DomainError(
            err.status === 429 ? "rate_limit_exceeded" : "unprocessable",
            `Gemini API request failed: ${sanitized}`,
          );
        }

        if (err instanceof Error && err.name === "AbortError") {
          throw new DomainError(
            "unprocessable",
            `Gemini API request timed out after ${this.timeoutMs}ms`,
          );
        }

        const rawMessage = err instanceof Error ? err.message : String(err);
        throw new DomainError(
          "unprocessable",
          `Gemini API network error: ${this.sanitize(rawMessage)}`,
        );
      }
    }

    if (lastError) {
      if (lastError instanceof DomainError) throw lastError;
      throw new DomainError(
        "rate_limit_exceeded",
        `Gemini API request failed on all keys: ${this.sanitize(lastError.message)}`,
      );
    }

    throw new DomainError(
      "rate_limit_exceeded",
      "All Gemini API keys are currently rate-limited or exhausted.",
    );
  }
}
