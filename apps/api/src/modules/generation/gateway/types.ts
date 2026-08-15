/**
 * ModelGateway abstraction (PR6-4).
 *
 * The sole caller of AI providers. Kept in the API infrastructure layer
 * (not packages/domain) because providers, configuration, token accounting,
 * observability, retries, and network concerns do not belong in the pure
 * domain package.
 *
 * PR6-4 ships only the `mock` provider. Real providers (openai/anthropic/…)
 * are added later behind the same interface without changing callers.
 */

import type { DocumentId, OrganizationId } from "@avana/domain";

/**
 * Model provider identifier.
 *
 * Extensible — future "openai" | "anthropic" | "azure" are added behind the
 * same ModelGateway interface. PR6-4 only provides the "mock" provider.
 */
export type ModelProvider = "mock" | "gemini" | "cloudflare";

/**
 * A single message in a completion request.
 */
export type CompletionMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Request handed to a model gateway.
 */
export type CompletionRequest = {
  /** Prompt/template version for regeneration and cost analysis. */
  promptVersion: string;
  /** Conversation context. */
  messages: CompletionMessage[];
  /** Maximum output tokens (optional). */
  maxTokens?: number;
  /** Sampling temperature (optional). */
  temperature?: number;
  /** Structured-output contract the response must conform to. */
  jsonSchema?: unknown;
  /** Correlation id tied to request_id / job_id for observability. */
  correlationId: string;
  /** Organization scope. */
  organizationId: OrganizationId;
  /** Source document. */
  documentId: DocumentId;
};

/**
 * Result of a model completion call.
 */
export type CompletionResult = {
  /** Raw text output (schema-valid JSON for structured-output requests). */
  text: string;
  /** Model identifier used by the provider. */
  model: string;
  /** Token accounting for cost analysis. */
  usage: { inputTokens: number; outputTokens: number };
  /** Provider finish reason (e.g. "stop", "length"). */
  finishReason: string;
};

/**
 * Provider-agnostic model gateway.
 *
 * Implementations are responsible for provider selection, structured-output
 * validation, and returning token usage. Retry/circuit-breaker are deferred
 * to PR6-5 workers (a decorator can wrap this interface later).
 */
export interface ModelGateway {
  readonly provider: ModelProvider;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
