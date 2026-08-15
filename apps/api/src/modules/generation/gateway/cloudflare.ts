/**
 * CloudflareModelGateway — Real Cloudflare Workers AI provider.
 *
 * Implements the provider-agnostic ModelGateway interface using Cloudflare's
 * official Workers AI REST API.
 *
 * Key features:
 * - Reads credentials only from constructor argument / environment.
 * - Never leaks API token or Account ID in logs, URLs, error messages, or client payloads.
 * - Uses native global fetch (no heavy SDK dependencies required).
 * - Converts conversation messages into Cloudflare's chat completion messages format.
 * - Supports configurable model (defaulting to @cf/zai-org/glm-4.7-flash).
 * - Extracts token usage and finish reason from Cloudflare Workers AI response envelope.
 * - Handles timeouts, rate limits, API error envelopes, and transient errors safely.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";

export const DEFAULT_CLOUDFLARE_AI_MODEL = "@cf/zai-org/glm-4.7-flash";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4/accounts";

export interface CloudflareModelGatewayOptions {
  accountId: string;
  apiToken: string;
  modelName?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class CloudflareModelGateway implements ModelGateway {
  readonly provider = "cloudflare" as const;
  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: CloudflareModelGatewayOptions) {
    if (!options.accountId || options.accountId.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        "Cloudflare Account ID must not be empty",
      );
    }

    if (!options.apiToken || options.apiToken.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        "Cloudflare API token must not be empty",
      );
    }

    this.accountId = options.accountId.trim();
    this.apiToken = options.apiToken.trim();
    this.modelName = options.modelName?.trim() || DEFAULT_CLOUDFLARE_AI_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  /**
   * Helper to sanitize any string by removing secrets before logging or throwing.
   */
  private sanitize(str: string): string {
    let sanitized = str;
    if (this.apiToken) {
      sanitized = sanitized.split(this.apiToken).join("[REDACTED]");
    }
    if (this.accountId) {
      sanitized = sanitized.split(this.accountId).join("[REDACTED_ACCOUNT]");
    }
    return sanitized;
  }

  /**
   * Execute a completion request against the Cloudflare Workers AI API.
   */
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    try {
      // 1. Prepare chat messages format
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

      if (req.systemInstruction) {
        messages.push({ role: "system", content: req.systemInstruction });
      }

      if (req.messages && req.messages.length > 0) {
        for (const msg of req.messages) {
          messages.push({ role: msg.role, content: msg.content });
        }
      } else if (req.prompt) {
        messages.push({ role: "user", content: req.prompt });
      } else {
        messages.push({ role: "user", content: "Generate structured study content." });
      }

      // 2. Build Cloudflare Workers AI request body
      const requestBody: Record<string, unknown> = {
        messages,
        temperature: req.temperature ?? 0.2,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
      };

      // 3. Make HTTP request with retry handling for transient errors
      const endpointModel = this.modelName.startsWith("@")
        ? this.modelName
        : `@cf/${this.modelName}`;
      const url = `${CLOUDFLARE_API_BASE_URL}/${encodeURIComponent(this.accountId)}/ai/run/${endpointModel}`;

      let responseText = "";
      let lastStatusCode = 0;
      let lastStatusText = "";
      const maxRetries = 6;

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
              "Authorization": `Bearer ${this.apiToken}`,
              "Content-Type": "application/json",
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
              `Cloudflare Workers AI request timed out after ${this.timeoutMs}ms`,
            );
          }
          if (attempt < maxRetries) {
            const waitSec = Math.min(20, Math.round(2 * Math.pow(1.5, attempt)));
            const cause = (fetchErr as { cause?: unknown })?.cause;
            const errStr = cause ? `${String(fetchErr)} (cause: ${String(cause)})` : String(fetchErr);
            const sanitizedErr = this.sanitize(errStr);
            process.stdout.write(
              `[cloudflare-gateway] Network/Fetch notice on attempt ${attempt + 1}: ${sanitizedErr}. Retrying in ${waitSec}s...\n`,
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

        if (lastStatusCode === 429) {
          throw new DomainError(
            "rate_limit_exceeded",
            "Cloudflare Workers AI rate limit exceeded. Please retry later.",
          );
        }

        const isTransientServerError =
          lastStatusCode === 503 ||
          lastStatusCode === 500 ||
          lastStatusCode === 502;

        if (isTransientServerError && attempt < maxRetries) {
          const waitSec = 1;
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }

        // Parse error message safely without exposing secrets
        let errorDetails = `HTTP ${lastStatusCode} ${lastStatusText}`;
        try {
          const errData = JSON.parse(responseText) as {
            errors?: Array<{ code?: number; message?: string }>;
            messages?: string[];
          };
          if (errData?.errors && errData.errors.length > 0) {
            errorDetails = errData.errors
              .map((e) => e.message || String(e.code))
              .join("; ");
          }
        } catch {
          if (responseText.trim().length > 0) {
            errorDetails = responseText.slice(0, 300);
          }
        }

        const sanitized = this.sanitize(errorDetails);
        throw new DomainError(
          lastStatusCode === 429 ? "rate_limit_exceeded" : "unprocessable",
          `Cloudflare Workers AI request failed: ${sanitized}`,
        );
      }

      // 4. Parse Cloudflare Workers AI response envelope
      let data: {
        success?: boolean;
        result?: {
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
          response?: string;
          text?: string;
          generated_text?: string;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        };
        errors?: Array<{ code?: number; message?: string }>;
      };

      try {
        data = JSON.parse(responseText);
      } catch (err) {
        throw new DomainError(
          "unprocessable",
          `Failed to parse Cloudflare Workers AI response JSON: ${String(err)}`,
        );
      }

      if (data.success === false && data.errors && data.errors.length > 0) {
        const errorMsg = data.errors.map((e) => e.message).join("; ");
        throw new DomainError(
          "unprocessable",
          `Cloudflare Workers AI returned error: ${this.sanitize(errorMsg)}`,
        );
      }

      const result = data.result;
      const rawText =
        result?.choices?.[0]?.message?.content ??
        result?.response ??
        result?.text ??
        result?.generated_text;

      if (!rawText || rawText.trim().length === 0) {
        throw new DomainError(
          "unprocessable",
          "Cloudflare Workers AI returned an empty completion response",
        );
      }

      const inputTokens = result?.usage?.prompt_tokens ?? 0;
      const outputTokens = result?.usage?.completion_tokens ?? 0;
      const finishReason = result?.choices?.[0]?.finish_reason ?? "stop";
      const model = result?.model ?? this.modelName;

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
          `Cloudflare Workers AI request timed out after ${this.timeoutMs}ms`,
        );
      }

      const rawMessage = err instanceof Error ? err.message : String(err);
      const sanitized = this.sanitize(rawMessage);
      throw new DomainError(
        "unprocessable",
        `Cloudflare Workers AI network error: ${sanitized}`,
      );
    }
  }
}
