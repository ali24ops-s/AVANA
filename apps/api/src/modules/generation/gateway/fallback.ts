/**
 * FallbackModelGateway — Multi-provider fallback chain.
 *
 * Implements the provider-agnostic ModelGateway interface by chaining multiple
 * ModelGateway instances in priority order:
 * Primary (GapGPT) -> Fallback 1 (Gemini) -> Fallback 2 (Groq) -> [Additional Fallbacks]
 *
 * Execution logic:
 * 1. Attempts completion on the primary gateway first.
 * 2. If successful, returns immediately with zero unnecessary requests to subsequent providers.
 * 3. If a provider fails (e.g. rate limit, 50x server error, network timeout), logs the failure
 *    and seamlessly attempts the next gateway in the chain.
 * 4. If all gateways in the chain fail, throws the last encountered error.
 */

import { DomainError } from "@avana/domain";
import type {
  ModelGateway,
  ModelProvider,
  CompletionRequest,
  CompletionResult,
} from "./types.js";

export class FallbackModelGateway implements ModelGateway {
  readonly gateways: ModelGateway[];

  get provider(): ModelProvider {
    return this.gateways[0].provider;
  }

  get model(): string | undefined {
    return this.gateways[0].model;
  }

  constructor(gateways: ModelGateway[]) {
    if (!gateways || gateways.length === 0) {
      throw new DomainError(
        "unprocessable",
        "FallbackModelGateway requires at least one ModelGateway",
      );
    }
    this.gateways = gateways;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    let lastError: unknown;

    for (let i = 0; i < this.gateways.length; i++) {
      const currentGateway = this.gateways[i];
      try {
        const result = await currentGateway.complete(req);
        return result;
      } catch (err) {
        lastError = err;
        const isLast = i === this.gateways.length - 1;
        if (!isLast) {
          const nextGateway = this.gateways[i + 1];
          const errMessage =
            err instanceof Error ? err.message : String(err);
          process.stdout.write(
            `[fallback-gateway] Provider '${currentGateway.provider}' failed: ${errMessage}. Falling back to '${nextGateway.provider}'...\n`,
          );
        }
      }
    }

    throw lastError;
  }
}
