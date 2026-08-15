/**
 * GeminiModelGateway — Real Google Gemini API provider.
 *
 * Implements the provider-agnostic ModelGateway interface using Google's
 * Gemini REST API with Structured JSON output mode (responseMimeType: "application/json").
 *
 * Key features:
 * - Reads API key only from constructor argument / environment.
 * - Never leaks API key in logs, URLs, error messages, or client payloads.
 * - Uses native global fetch (no heavy SDK dependencies required).
 * - Converts conversation messages into Gemini's systemInstruction + contents format.
 * - Supports configurable model (defaulting to current production gemini-2.5-flash).
 * - Extracts token usage from Gemini usageMetadata.
 * - Handles timeouts, API error envelopes, and invalid payloads safely.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";

const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiModelGatewayOptions {
  apiKey: string;
  modelName?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class GeminiModelGateway implements ModelGateway {
  readonly provider = "gemini" as const;
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: GeminiModelGatewayOptions) {
    if (!options.apiKey || options.apiKey.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        "Gemini API key must not be empty",
      );
    }

    this.apiKey = options.apiKey.trim();
    this.modelName = options.modelName?.trim() || DEFAULT_GEMINI_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Execute a completion request against the Gemini API.
   */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    try {
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

      // Fallback: if no contents provided, add a default user message
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

      // 3. Make the HTTP request using header authentication with automatic 429 backoff retry
      const url = `${GEMINI_API_BASE_URL}/${encodeURIComponent(this.modelName)}:generateContent`;
      
      let responseText = "";
      let lastStatusCode = 0;
      let lastStatusText = "";
      const maxRetries = 10;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
              "x-goog-api-key": this.apiKey,
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
          if (attempt < maxRetries) {
            const waitSec = Math.min(30, Math.round(4 * Math.pow(1.5, attempt)));
            process.stdout.write(
              `[gemini-gateway] Network/Fetch notice on attempt ${attempt + 1}: ${String(fetchErr)}. Retrying in ${waitSec}s...\n`,
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

        // Daily or hard quota exhaustion: immediately throw rate_limit_exceeded (do not wait)
        if (
          responseText.includes("GenerateRequestsPerDay") ||
          responseText.includes("limit: 20") ||
          responseText.includes("free_tier_requests")
        ) {
          process.stdout.write(
            `[gemini-gateway] Gemini Free Tier quota exceeded: ${responseText.slice(0, 200)}\n`,
          );
          throw new DomainError(
            "rate_limit_exceeded",
            "Gemini API rate limit: Free tier quota exceeded (20 requests/day). Please upgrade to paid tier or configure custom API key.",
          );
        }

        const isTransientError =
          lastStatusCode === 429 ||
          lastStatusCode === 503 ||
          lastStatusCode === 500 ||
          lastStatusCode === 502 ||
          responseText.includes("high demand") ||
          responseText.includes("UNAVAILABLE");

        const maxRetriesPerRequest = 2;
        if (isTransientError && attempt < maxRetriesPerRequest) {
          const match = responseText.match(/retry in ([0-9.]+)\s*s/i);
          const waitSec = match && match[1] ? Math.min(15, Math.ceil(parseFloat(match[1])) + 1) : 5;
          process.stdout.write(
            `[gemini-gateway] Transient Gemini API notice (${lastStatusCode}, attempt ${attempt + 1}/${maxRetriesPerRequest + 1}): ${responseText.slice(0, 120)}\n`,
          );
          process.stdout.write(
            `[gemini-gateway] Waiting ${waitSec}s before attempt ${attempt + 2}...\n`,
          );
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        let errorDetails = `HTTP ${lastStatusCode} ${lastStatusText}`;
        try {
          const errData = JSON.parse(responseText) as {
            error?: { message?: string };
          };
          if (errData?.error?.message) {
            errorDetails = errData.error.message;
          }
        } catch {
          if (responseText.trim().length > 0) {
            errorDetails = responseText.slice(0, 300);
          }
        }
        const sanitized = errorDetails.replace(this.apiKey, "[REDACTED]");
        throw new DomainError(
          lastStatusCode === 429 ? "rate_limit_exceeded" : "unprocessable",
          `Gemini API request failed: ${sanitized}`,
        );
      }

      // 5. Parse Gemini response structure
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
          `Failed to parse Gemini response JSON: ${String(err)}`,
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
    } catch (err) {
      if (err instanceof DomainError) {
        throw err;
      }

      if (err instanceof Error && err.name === "AbortError") {
        throw new DomainError(
          "unprocessable",
          `Gemini API request timed out after ${this.timeoutMs}ms`,
        );
      }

      const rawMessage = err instanceof Error ? err.message : String(err);
      const sanitized = rawMessage.replace(this.apiKey, "[REDACTED]");
      throw new DomainError(
        "unprocessable",
        `Gemini API network error: ${sanitized}`,
      );
    }
  }
}
