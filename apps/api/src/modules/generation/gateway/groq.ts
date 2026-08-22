/**
 * GroqModelGateway — Official Groq API provider (OpenAI-compatible Structured Outputs).
 *
 * Implements the provider-agnostic ModelGateway interface using Groq's
 * OpenAI-compatible Chat Completions REST API (https://api.groq.com/openai/v1/chat/completions).
 *
 * Key features:
 * - Reads credentials securely from constructor argument or GROQ_API_KEY environment variable.
 * - Redacts all API keys in logs, errors, and URLs (zero leakage guarantee).
 * - Uses native global fetch with no unnecessary heavy SDK dependencies.
 * - Employs response_format: { type: "json_schema", json_schema: { name, strict: true, schema } } for Structured Outputs.
 * - Extracts token usage (prompt_tokens, completion_tokens) and model information.
 * - Distinguishes 429 rate limits, 401 auth errors, timeouts, network errors, and transient server errors.
 * - Controlled transient retry for 50x server errors.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  CompletionRequest,
  CompletionResult,
} from "./types.js";

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const GROQ_API_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface GroqModelGatewayOptions {
  /** Groq API Key. */
  apiKey?: string;
  /** Configured Groq model (defaults to openai/gpt-oss-120b). */
  modelName?: string;
  /** Request timeout in milliseconds (defaults to 180,000ms). */
  timeoutMs?: number;
  /** Custom fetch implementation for unit testing. */
  fetchFn?: typeof fetch;
}

export interface GroqJsonSchemaStructure {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

/**
 * Adapt AVANA jsonSchema request into Groq's strict JSON Schema format.
 */
export function adaptToGroqJsonSchema(jsonSchema: unknown): GroqJsonSchemaStructure | null {
  if (!jsonSchema || typeof jsonSchema !== "object") {
    return null;
  }

  const schemaObj = jsonSchema as Record<string, unknown>;
  const typeKey = typeof schemaObj.type === "string" ? schemaObj.type.toLowerCase() : "";

  if (typeKey === "content_plan") {
    return {
      name: "content_plan",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "moduleTitle", "sourceTopics", "sessions", "highYieldFacts", "citationChunkIds"],
        properties: {
          kind: { type: "string" },
          moduleTitle: { type: "string" },
          sourceTopics: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "title", "description", "category", "relevantChunkIds"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                category: { type: "string" },
                relevantChunkIds: { type: "array", items: { type: "string" } },
              },
            },
          },
          sessions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["index", "title", "description", "coreConcepts", "relevantChunkIds", "targetFlashcardCount", "targetQuizCount"],
              properties: {
                index: { type: "integer" },
                title: { type: "string" },
                description: { type: "string" },
                coreConcepts: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "name", "category", "description", "sourceChunkIds"],
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      category: { type: "string" },
                      description: { type: "string" },
                      sourceChunkIds: { type: "array", items: { type: "string" } },
                    },
                  },
                },
                relevantChunkIds: { type: "array", items: { type: "string" } },
                targetFlashcardCount: { type: "integer" },
                targetQuizCount: { type: "integer" },
              },
            },
          },
          highYieldFacts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "fact", "category", "sessionIndex"],
              properties: {
                id: { type: "string" },
                fact: { type: "string" },
                category: { type: "string" },
                sessionIndex: { type: "integer" },
              },
            },
          },
          citationChunkIds: { type: "array", items: { type: "string" } },
        },
      },
    };
  }

  if (typeKey === "sessions_batch") {
    return {
      name: "sessions_batch",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "sessions"],
        properties: {
          kind: { type: "string" },
          sessions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["index", "title", "contentMarkdown", "citationChunkIds"],
              properties: {
                index: { type: "integer" },
                title: { type: "string" },
                contentMarkdown: { type: "string" },
                citationChunkIds: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    };
  }

  if (typeKey === "session" || typeKey === "lesson") {
    return {
      name: "session_lesson",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "contentMarkdown"],
        properties: {
          kind: { type: "string" },
          title: { type: "string" },
          contentMarkdown: { type: "string" },
        },
      },
    };
  }

  if (typeKey === "flashcards_batch" || typeKey === "flashcard") {
    return {
      name: "flashcards_batch",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "cards"],
        properties: {
          kind: { type: "string" },
          cards: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["question", "answer", "explanation", "cardType", "difficulty"],
              properties: {
                question: { type: "string" },
                answer: { type: "string" },
                explanation: { type: "string" },
                cardType: { type: "string" },
                difficulty: { type: "string" },
              },
            },
          },
        },
      },
    };
  }

  if (typeKey === "quizzes_batch" || typeKey === "quiz") {
    return {
      name: "quizzes_batch",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "questions"],
        properties: {
          kind: { type: "string" },
          questions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["question", "questionType", "choices", "correctAnswer", "explanation"],
              properties: {
                question: { type: "string" },
                questionType: { type: "string" },
                choices: { type: "array", items: { type: "string" } },
                correctAnswer: { type: "string" },
                explanation: { type: "string" },
              },
            },
          },
        },
      },
    };
  }

  if (typeKey === "recommendation") {
    return {
      name: "recommendation",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "summary", "actions"],
        properties: {
          kind: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          actions: { type: "array", items: { type: "string" } },
        },
      },
    };
  }

  // If already a full schema object with properties:
  if (schemaObj.properties && typeof schemaObj.properties === "object") {
    const rawProps = schemaObj.properties as Record<string, unknown>;
    const propKeys = Object.keys(rawProps);
    const existingReq = Array.isArray(schemaObj.required) ? (schemaObj.required as string[]) : [];
    const requiredKeys = Array.from(new Set([...existingReq, ...propKeys]));

    return {
      name: (typeof schemaObj.name === "string" ? schemaObj.name : "custom_schema"),
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: requiredKeys,
        properties: schemaObj.properties,
      },
    };
  }

  return null;
}

export class GroqModelGateway implements ModelGateway {
  readonly provider = "groq" as const;
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  get model(): string {
    return this.modelName;
  }

  constructor(options: GroqModelGatewayOptions = {}) {
    const key = options.apiKey?.trim() || process.env.GROQ_API_KEY?.trim() || "";

    if (!key) {
      throw new DomainError(
        "unprocessable",
        "GROQ_API_KEY is required when AI_PROVIDER is 'groq'",
      );
    }

    this.apiKey = key;
    this.modelName = options.modelName?.trim() || DEFAULT_GROQ_MODEL;
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
   * Execute a completion request against Groq's Chat Completions API.
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

    // 2. Build Groq Chat Completion request body
    const requestBody: Record<string, unknown> = {
      model: this.modelName,
      messages,
      temperature: req.temperature ?? 0.2,
      ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    };

    // When structured output is requested, use strict json_schema or fallback to json_object
    if (req.jsonSchema) {
      const adapted = adaptToGroqJsonSchema(req.jsonSchema);
      if (adapted) {
        requestBody.response_format = {
          type: "json_schema",
          json_schema: {
            name: adapted.name,
            strict: adapted.strict,
            schema: adapted.schema,
          },
        };
      } else {
        requestBody.response_format = { type: "json_object" };
      }
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
        const response = await this.fetchFn(GROQ_API_CHAT_URL, {
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
            if (key.toLowerCase().startsWith("x-ratelimit") || key.toLowerCase() === "retry-after") {
              rateLimitHeaders[key.toLowerCase()] = val;
            }
          });
        }
      } catch (fetchErr) {
        clearTimeout(attemptTimer);
        if (attemptController.signal.aborted) {
          throw new DomainError(
            "unprocessable",
            `Groq API request timed out after ${this.timeoutMs}ms`,
          );
        }
        if (attempt < maxRetries) {
          const waitSec = (attempt + 1) * 2;
          process.stdout.write(
            `[groq-gateway] Network notice (attempt ${attempt + 1}): ${this.sanitize(String(fetchErr))}. Retrying in ${waitSec}s...\n`,
          );
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        const sanitizedErr = this.sanitize(
          fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
        );
        throw new DomainError(
          "unprocessable",
          `Groq API network error: ${sanitizedErr}`,
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
          `[groq-gateway] Transient HTTP ${lastStatusCode} (attempt ${attempt + 1}). Retrying in ${waitSec}s...\n`,
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
          `Groq API rate limit exceeded${retryNotice}: ${sanitizedMessage}`,
        );
      }

      if (lastStatusCode === 401) {
        throw new DomainError(
          "unprocessable",
          `Groq API authentication failed (401 Unauthorized): ${sanitizedMessage}`,
        );
      }

      throw new DomainError(
        "unprocessable",
        `Groq API request failed (${lastStatusCode}): ${sanitizedMessage}`,
      );
    }

    // 3. Parse Groq response envelope
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
        `Failed to parse Groq response JSON: ${this.sanitize(String(err))}`,
      );
    }

    if (data.error?.message) {
      throw new DomainError(
        "unprocessable",
        `Groq API returned an error: ${this.sanitize(data.error.message)}`,
      );
    }

    const choice = data.choices?.[0];
    const rawText = choice?.message?.content;

    if (!rawText || rawText.trim().length === 0) {
      throw new DomainError(
        "unprocessable",
        "Groq API returned an empty completion response",
      );
    }

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const finishReason = choice?.finish_reason ?? "stop";
    const model = data.model ?? this.modelName;

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
}
