/**
 * GapGPTModelGateway — GapGPT API provider (OpenAI-compatible Chat Completions).
 *
 * Implements the provider-agnostic ModelGateway interface using GapGPT's
 * OpenAI-compatible Chat Completions REST API (https://api.gapgpt.app/v1/chat/completions).
 *
 * Key features:
 * - Reads credentials securely from constructor argument or GAPGPT_API_KEY environment variable.
 * - Redacts all API keys in logs, errors, and URLs (zero leakage guarantee).
 * - Native global fetch with no unnecessary heavy SDK dependencies.
 * - Supports structured JSON generation and response parsing with markdown code fence normalization.
 * - Extracts token usage (prompt_tokens, completion_tokens) and model information.
 * - Distinguishes 429 rate limits, 401 auth errors, 403 forbidden, timeouts, network errors, and server errors.
 * - Controlled transient retry for 50x server errors.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";

export const DEFAULT_GAPGPT_MODEL = "gpt-5.6-luna";
export const DEFAULT_GAPGPT_BASE_URL = "https://api.gapgpt.app/v1";
export const GAPGPT_API_CHAT_URL = "https://api.gapgpt.app/v1/chat/completions";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;

export interface GapGPTModelGatewayOptions {
  /** GapGPT API Key. */
  apiKey?: string;
  /** Configured GapGPT model (defaults to gpt-5.6-luna). */
  modelName?: string;
  /** Base URL for GapGPT API (defaults to https://api.gapgpt.app/v1). */
  baseUrl?: string;
  /** Request timeout in milliseconds (defaults to 180,000ms). */
  timeoutMs?: number;
  /** Custom fetch implementation for unit testing. */
  fetchFn?: typeof fetch;
}

/**
 * Robust JSON cleaner and parser for GapGPT responses.
 * Normalizes markdown code fences (```json ... ```) and trims whitespace.
 */
export function cleanAndParseGapGPTJson<T = unknown>(rawText: string): T {
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
        `GapGPT returned invalid JSON output: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      );
    }
  }
}

export class GapGPTModelGateway implements ModelGateway {
  readonly provider = "gapgpt" as const;
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly baseUrl: string;
  private readonly chatUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  get model(): string {
    return this.modelName;
  }

  constructor(options: GapGPTModelGatewayOptions = {}) {
    const key =
      options.apiKey?.trim() || process.env.GAPGPT_API_KEY?.trim() || "";

    if (!key) {
      throw new DomainError(
        "unprocessable",
        "GAPGPT_API_KEY is required when AI_PROVIDER is 'gapgpt'",
      );
    }

    this.apiKey = key;
    this.modelName =
      options.modelName?.trim() ||
      process.env.GAPGPT_MODEL?.trim() ||
      DEFAULT_GAPGPT_MODEL;
    const rawBaseUrl =
      options.baseUrl?.trim() ||
      process.env.GAPGPT_BASE_URL?.trim() ||
      DEFAULT_GAPGPT_BASE_URL;
    this.baseUrl = rawBaseUrl.replace(/\/+$/, "");
    this.chatUrl = `${this.baseUrl}/chat/completions`;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Helper to sanitize text by redacting the API key.
   */
  private sanitize(str: string): string {
    if (!this.apiKey) return str;
    return str.split(this.apiKey).join("[REDACTED]");
  }

  /**
   * Execute a completion request against GapGPT's Chat Completions API.
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

    // 2. Build GapGPT Chat Completion request body
    const requestBody: Record<string, unknown> = {
      model: this.modelName,
      messages,
      temperature: req.temperature ?? 0.2,
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
            "Authorization": `Bearer ${this.apiKey}`,
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
            `GapGPT API request timed out after ${this.timeoutMs}ms`,
          );
        }
        if (attempt < maxRetries) {
          const waitSec = (attempt + 1) * 2;
          process.stdout.write(
            `[gapgpt-gateway] Network notice (attempt ${attempt + 1}): ${this.sanitize(String(fetchErr))}. Retrying in ${waitSec}s...\n`,
          );
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        const sanitizedErr = this.sanitize(
          fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        );
        throw new DomainError(
          "unprocessable",
          `GapGPT API network error: ${sanitizedErr}`,
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
          `[gapgpt-gateway] Transient HTTP ${lastStatusCode} (attempt ${attempt + 1}). Retrying in ${waitSec}s...\n`,
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
        if (responseText.trim().length > 0) {
          errorDetails = responseText.slice(0, 300);
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
          `GapGPT API rate limit exceeded${retryNotice}: ${sanitizedMessage}`,
        );
      }

      if (lastStatusCode === 401) {
        throw new DomainError(
          "unprocessable",
          `GapGPT API authentication failed (401 Unauthorized): ${sanitizedMessage}`,
        );
      }

      if (lastStatusCode === 403) {
        throw new DomainError(
          "unprocessable",
          `GapGPT API access forbidden (403 Forbidden): ${sanitizedMessage}`,
        );
      }

      throw new DomainError(
        "unprocessable",
        `GapGPT API request failed (${lastStatusCode}): ${sanitizedMessage}`,
      );
    }

    // 3. Parse GapGPT response envelope
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
        `Failed to parse GapGPT response JSON: ${this.sanitize(String(err))}`,
      );
    }

    if (data.error?.message) {
      throw new DomainError(
        "unprocessable",
        `GapGPT API returned an error: ${this.sanitize(data.error.message)}`,
      );
    }

    const choice = data.choices?.[0];
    const rawText = choice?.message?.content;

    if (!rawText || rawText.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        "GapGPT API returned an empty completion response",
      );
    }

    let outputText = rawText.trim();
    if (req.jsonSchema) {
      // Validate that it parses as JSON and clean markdown code fences
      const parsedObj = cleanAndParseGapGPTJson(outputText);
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
