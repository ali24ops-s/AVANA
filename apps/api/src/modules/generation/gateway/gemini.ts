/**
 * GeminiModelGateway — Real Google Gemini API provider with Multi-Key rotation & failover.
 *
 * Implements the provider-agnostic ModelGateway interface using Google's
 * Gemini REST API with Structured JSON output mode (responseMimeType: "application/json").
 *
 * Key architectural guarantees:
 * - Sole Owner of Provider Retry for transient 50x server errors & network timeouts.
 * - Exponential Backoff with Jitter for transient errors (503, 500, 502, 504, timeout).
 * - Strictly bounded request count (max 3 total attempts per completion call).
 * - Multi-Key KeyPool with Least-Recently-Used rotation and automatic health tracking.
 * - Multi-Key Failover for 401 (invalid), 403 (quota/invalid), 429 (rate/quota).
 * - Safe structured logging: provider, model, http status, error code/message, attempt, latency, correlation ID, stage.
 * - Strict security: API keys are NEVER printed in logs, URLs, error messages, or client payloads.
 * - Prompts, source chunks, and user data are never logged.
 * - Zero fallback to Groq or other secondary providers.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";
import { GeminiKeyPool, type GeminiKeySlot } from "./gemini-key-pool.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
export const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

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
  /** Custom sleep implementation (used in unit tests for zero delay). */
  sleepFn?: (ms: number) => Promise<void>;
}

export class GeminiHttpError extends Error {
  public readonly geminiMessage?: string;
  public readonly geminiStatus?: string;
  public readonly geminiCode?: number;

  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    let geminiMsg: string | undefined;
    let geminiStat: string | undefined;
    let geminiCd: number | undefined;

    try {
      const parsed = JSON.parse(body) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed?.error) {
        geminiMsg = parsed.error.message;
        geminiStat = parsed.error.status;
        geminiCd = parsed.error.code;
      }
    } catch {
      // Non-JSON response body
    }

    const details = geminiMsg || (body.trim().length > 0 ? body.slice(0, 300) : statusText);
    super(`HTTP ${status} ${statusText}: ${details}`);
    this.name = "GeminiHttpError";
    this.geminiMessage = geminiMsg;
    this.geminiStatus = geminiStat;
    this.geminiCode = geminiCd;
  }
}

export class GeminiModelGateway implements ModelGateway {
  readonly provider = "gemini" as const;
  private readonly keyPool: GeminiKeyPool;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;

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
    this.sleepFn = options.sleepFn ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Helper to sanitize text by redacting all API keys managed by the pool.
   */
  private sanitize(str: string): string {
    return this.keyPool.sanitize(str);
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
   * Structured safe logging helper.
   * Outputs request metadata without leaking secrets, prompt contents, or user data.
   */
  private logRequestEvent(params: {
    event: "attempt" | "retry" | "success" | "failover" | "error";
    slotId: string;
    attempt: number;
    maxAttempts: number;
    status?: number;
    geminiCode?: number;
    geminiStatus?: string;
    geminiMessage?: string;
    durationMs: number;
    delayMs?: number;
    decision?: string;
    req: CompletionRequest;
  }): void {
    const sanitizedMsg = params.geminiMessage ? this.sanitize(params.geminiMessage) : undefined;
    const docId = params.req.documentId || "unknown";
    const corrId = params.req.correlationId || "unknown";
    const jobId = params.req.jobId || corrId;
    const stage = params.req.stage || "generation";

    const statusStr = params.status !== undefined ? `HTTP ${params.status}` : "Network/Timeout";
    const errSnippet = sanitizedMsg
      ? ` (${params.geminiStatus ? `[${params.geminiStatus}] ` : ""}${sanitizedMsg.slice(0, 150)})`
      : "";
    const delayStr = params.delayMs !== undefined ? ` in ${(params.delayMs / 1000).toFixed(1)}s` : "";

    process.stdout.write(
      `[gemini-gateway] [provider: ${this.provider}, model: ${this.modelName}, slot: ${params.slotId}] [stage: ${stage}, job: ${jobId}, doc: ${docId}] ${params.event.toUpperCase()} (${statusStr}${errSnippet}, attempt ${params.attempt}/${params.maxAttempts}, ${params.durationMs}ms). Decision: ${params.decision || "none"}${delayStr}\n`,
    );
  }

  /**
   * Classify an error to decide if key failover/switch or transient retry should be executed.
   */
  private classifyError(err: unknown): {
    type: "switch" | "rethrow";
    reason?: "invalid" | "quota_exhausted" | "rate_limited" | "server_error";
    cooldownMs?: number;
  } {
    if (!(err instanceof GeminiHttpError)) {
      return { type: "rethrow" };
    }

    const { status, body, geminiStatus, geminiMessage } = err;
    const lower = `${body} ${geminiStatus || ""} ${geminiMessage || ""}`.toLowerCase();

    // 400 Bad Request / 404 Not Found (schema, prompt, or invalid model name) -> non-retryable
    if (status === 400 || status === 404) {
      return { type: "rethrow" };
    }

    // 401 Unauthorized -> Invalid Key
    if (status === 401) {
      return { type: "switch", reason: "invalid" };
    }

    // 403 Forbidden -> Inspect body for quota vs invalid key vs general permission/location
    if (status === 403) {
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
        lower.includes("api key not valid") ||
        lower.includes("api key expired") ||
        lower.includes("invalid api key") ||
        lower.includes("api_key_not_found")
      ) {
        return { type: "switch", reason: "invalid" };
      }
      return { type: "rethrow" };
    }

    // 429 Too Many Requests -> Inspect body for daily quota vs temporary rate limit
    if (status === 429) {
      const match = body.match(/retry in ([0-9.]+)\s*s/i);
      if (match && match[1]) {
        const cooldownSec = Math.ceil(parseFloat(match[1])) + 2;
        return {
          type: "switch",
          reason: "rate_limited",
          cooldownMs: cooldownSec * 1000,
        };
      }
      if (
        lower.includes("generaterequestsperday") ||
        lower.includes("daily quota")
      ) {
        return {
          type: "switch",
          reason: "quota_exhausted",
          cooldownMs: 24 * 60 * 60 * 1000,
        };
      }
      return {
        type: "switch",
        reason: "rate_limited",
        cooldownMs: 60 * 1000,
      };
    }

    // 500 / 502 / 503 / 504 Server Errors (transient provider overload / outage)
    if (status === 500 || status === 502 || status === 503 || status === 504) {
      return {
        type: "switch",
        reason: "server_error",
        // Transient server errors do NOT apply client key cooldown
      };
    }

    return { type: "rethrow" };
  }

  /**
   * Throw appropriate DomainError corresponding to a GeminiHttpError.
   */
  private throwClassifiedError(httpErr: GeminiHttpError): never {
    const errorDetails = this.sanitize(
      httpErr.geminiMessage ||
      (httpErr.body.trim().length > 0 ? httpErr.body.slice(0, 300) : httpErr.statusText),
    );

    if (httpErr.status === 500 || httpErr.status === 502 || httpErr.status === 503 || httpErr.status === 504) {
      throw new DomainError(
        "service_unavailable",
        `Gemini API service unavailable (HTTP ${httpErr.status}): ${errorDetails}`,
      );
    }
    if (httpErr.status === 429) {
      throw new DomainError(
        "rate_limit_exceeded",
        `Gemini API rate limit exceeded: ${errorDetails}`,
      );
    }
    if (httpErr.status === 401) {
      throw new DomainError(
        "unauthorized",
        `Gemini API authentication failed: ${errorDetails}`,
      );
    }
    if (httpErr.status === 403) {
      const lower = `${httpErr.body} ${httpErr.geminiStatus || ""} ${httpErr.geminiMessage || ""}`.toLowerCase();
      const isQuota =
        lower.includes("generaterequestsperday") ||
        lower.includes("quota") ||
        lower.includes("ratelimitexceeded") ||
        lower.includes("resource_exhausted");
      throw new DomainError(
        isQuota ? "rate_limit_exceeded" : "forbidden",
        `Gemini API ${isQuota ? "quota exhausted" : "permission denied"}: ${errorDetails}`,
      );
    }
    if (httpErr.status === 404) {
      throw new DomainError(
        "not_found",
        `Gemini API endpoint or model not found: ${errorDetails}`,
      );
    }

    throw new DomainError(
      "unprocessable",
      `Gemini API request failed: ${errorDetails}`,
    );
  }

  /**
   * Parse structured Gemini completion response.
   */
  private parseResponse(responseText: string): CompletionResult {
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
   * Execute a completion request against Gemini with Multi-Key Failover & Bounded Retries.
   *
   * Architectural rules:
   * - Total requests sent to Google across all attempts and keys is strictly bounded by maxTotalAttempts (3).
   * - Exponential backoff with jitter is applied before retrying transient errors.
   * - Server errors (503) are retried with backoff without needlessly churning the keypool.
   * - Key rotation happens for 429/401/403 (quota/auth) when healthy keys exist.
   * - Zero fallback to Groq or secondary providers.
   */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
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
    const maxTotalAttempts = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxTotalAttempts; attempt++) {
      let slot: GeminiKeySlot;
      try {
        slot = this.keyPool.acquireKey();
      } catch (poolErr) {
        if (lastError && poolErr instanceof DomainError && poolErr.code === "rate_limit_exceeded") {
          throw lastError;
        }
        throw poolErr;
      }

      const startTime = Date.now();
      const attemptController = new AbortController();
      const attemptTimer = setTimeout(
        () => attemptController.abort(),
        this.timeoutMs,
      );

      let response: Response;
      let responseText = "";
      let durationMs = 0;

      try {
        response = await this.fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Connection": "close",
            "x-goog-api-key": slot.apiKey,
          },
          body: JSON.stringify(requestBody),
          signal: attemptController.signal,
        });
        durationMs = Date.now() - startTime;
        clearTimeout(attemptTimer);
        responseText = await response.text();
      } catch (fetchErr) {
        clearTimeout(attemptTimer);
        durationMs = Date.now() - startTime;
        const isTimeout = attemptController.signal.aborted;
        const rawErr = isTimeout
          ? `Gemini API request timed out after ${this.timeoutMs}ms`
          : (fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
        const sanitizedErr = this.sanitize(rawErr);

        if (attempt < maxTotalAttempts - 1) {
          const delayMs = this.calculateBackoffMs(attempt);
          this.logRequestEvent({
            event: "retry",
            slotId: slot.id,
            attempt: attempt + 1,
            maxAttempts: maxTotalAttempts,
            geminiMessage: sanitizedErr,
            durationMs,
            delayMs,
            decision: `Retry after network/timeout transient error in ${(delayMs / 1000).toFixed(1)}s`,
            req,
          });
          await this.sleepFn(delayMs);
          continue;
        }

        this.logRequestEvent({
          event: "error",
          slotId: slot.id,
          attempt: attempt + 1,
          maxAttempts: maxTotalAttempts,
          geminiMessage: sanitizedErr,
          durationMs,
          decision: "All network/timeout retries exhausted",
          req,
        });

        throw new DomainError(
          "service_unavailable",
          isTimeout
            ? `Gemini API request timed out after ${this.timeoutMs}ms`
            : `Gemini API network error: ${sanitizedErr}`,
        );
      }

      // 3. Handle successful HTTP response (200-299)
      if (response.status >= 200 && response.status < 300) {
        this.keyPool.reportSuccess(slot.id);
        this.logRequestEvent({
          event: "success",
          slotId: slot.id,
          attempt: attempt + 1,
          maxAttempts: maxTotalAttempts,
          status: response.status,
          durationMs,
          decision: "Request completed successfully",
          req,
        });

        return this.parseResponse(responseText);
      }

      // 4. Handle non-200 HTTP response
      const httpErr = new GeminiHttpError(response.status, response.statusText, responseText);
      lastError = httpErr;
      const classification = this.classifyError(httpErr);

      // Case A: Transient server error (500, 502, 503, 504)
      if (classification.reason === "server_error") {
        this.keyPool.reportFailure(slot.id, "server_error");

        if (attempt < maxTotalAttempts - 1) {
          const delayMs = this.calculateBackoffMs(attempt);
          this.logRequestEvent({
            event: "retry",
            slotId: slot.id,
            attempt: attempt + 1,
            maxAttempts: maxTotalAttempts,
            status: httpErr.status,
            geminiCode: httpErr.geminiCode,
            geminiStatus: httpErr.geminiStatus,
            geminiMessage: httpErr.geminiMessage || httpErr.statusText,
            durationMs,
            delayMs,
            decision: `Transient server error. Retrying with exponential backoff & jitter in ${(delayMs / 1000).toFixed(1)}s`,
            req,
          });
          await this.sleepFn(delayMs);
          continue;
        }

        // All retries exhausted
        this.logRequestEvent({
          event: "error",
          slotId: slot.id,
          attempt: attempt + 1,
          maxAttempts: maxTotalAttempts,
          status: httpErr.status,
          geminiCode: httpErr.geminiCode,
          geminiStatus: httpErr.geminiStatus,
          geminiMessage: httpErr.geminiMessage || httpErr.statusText,
          durationMs,
          decision: "All transient retries exhausted",
          req,
        });
        this.throwClassifiedError(httpErr);
      }

      // Case B: Key rotation switch (401, 403 quota/invalid, 429 rate/quota)
      if (classification.type === "switch" && classification.reason) {
        this.keyPool.reportFailure(slot.id, classification.reason, classification.cooldownMs);
        this.logRequestEvent({
          event: "failover",
          slotId: slot.id,
          attempt: attempt + 1,
          maxAttempts: maxTotalAttempts,
          status: httpErr.status,
          geminiCode: httpErr.geminiCode,
          geminiStatus: httpErr.geminiStatus,
          geminiMessage: httpErr.geminiMessage || httpErr.statusText,
          durationMs,
          decision: `Failover: slot marked ${classification.reason}. Switching to next key slot`,
          req,
        });

        const hasOtherHealthyKeys = this.keyPool
          .getSlotsSummary()
          .some((s) => s.state === "healthy" && s.id !== slot.id);

        if (hasOtherHealthyKeys && attempt < maxTotalAttempts - 1) {
          continue;
        }

        // No other key available or attempts exhausted
        this.throwClassifiedError(httpErr);
      }

      // Case C: Non-retryable error (400, 403 permission, 404)
      this.logRequestEvent({
        event: "error",
        slotId: slot.id,
        attempt: attempt + 1,
        maxAttempts: maxTotalAttempts,
        status: httpErr.status,
        geminiCode: httpErr.geminiCode,
        geminiStatus: httpErr.geminiStatus,
        geminiMessage: httpErr.geminiMessage || httpErr.statusText,
        durationMs,
        decision: "Non-retryable request/client error. Rethrowing immediately",
        req,
      });
      this.throwClassifiedError(httpErr);
    }

    if (lastError instanceof GeminiHttpError) {
      this.throwClassifiedError(lastError);
    }

    if (lastError instanceof DomainError) {
      throw lastError;
    }

    throw new DomainError(
      "service_unavailable",
      "All Gemini API attempts failed.",
    );
  }

  async checkHealth(): Promise<{
    status: "healthy" | "unhealthy" | "degraded";
    provider: "gemini";
    model: string;
    latencyMs: number | null;
    reason?: string;
  }> {
    const slot = this.keyPool.acquireKey();
    const key = slot?.apiKey;
    const startTime = Date.now();
    const url = `${GEMINI_API_BASE_URL}/${this.modelName}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 5000));
      const res = await this.fetchFn(url, {
        method: "GET",
        headers: {
          "x-goog-api-key": key || "",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      if (res.ok) {
        return {
          status: "healthy",
          provider: "gemini",
          model: this.modelName,
          latencyMs,
        };
      }

      const text = await res.text();
      let errorMsg = text;
      try {
        const json = JSON.parse(text) as { error?: { message?: string } };
        if (json?.error?.message) errorMsg = json.error.message;
      } catch {
        // ignore
      }

      if (res.status === 401) {
        return {
          status: "unhealthy",
          provider: "gemini",
          model: this.modelName,
          latencyMs: null,
          reason: `Gemini authentication failed: ${this.sanitize(errorMsg)}`,
        };
      }

      if (res.status === 429) {
        return {
          status: "degraded",
          provider: "gemini",
          model: this.modelName,
          latencyMs: null,
          reason: `Gemini rate limit exceeded: ${this.sanitize(errorMsg)}`,
        };
      }

      if (res.status === 403) {
        return {
          status: "degraded",
          provider: "gemini",
          model: this.modelName,
          latencyMs: null,
          reason: `Gemini quota exhausted: ${this.sanitize(errorMsg)}`,
        };
      }

      return {
        status: "unhealthy",
        provider: "gemini",
        model: this.modelName,
        latencyMs: null,
        reason: `Gemini health check returned status ${res.status}: ${this.sanitize(errorMsg)}`,
      };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        status: "unhealthy",
        provider: "gemini",
        model: this.modelName,
        latencyMs: null,
        reason: isTimeout ? "Gemini request timed out" : `Gemini connection failed: ${this.sanitize(err instanceof Error ? err.message : String(err))}`,
      };
    }
  }
}

