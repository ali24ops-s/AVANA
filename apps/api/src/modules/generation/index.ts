/**
 * Generation module — Public API (PR6-4).
 *
 * Exposes the ModelGateway abstraction, the generated-content stores, the
 * GenerationService, and the route plugin for the AI generation pipeline.
 */

export * from "./gateway/index.js";
export { GenerationService } from "./generation-service.js";
export type {
  GenerateResult,
  GeneratedContentResource,
} from "./generation-service.js";
export type {
  GeneratedContentStore,
  GeneratedContentCitationStore,
  GeneratedContentRecord,
  GeneratedContentCitationRecord,
} from "./generation-store.js";
export type {
  GenerationJobStore,
  GenerationJobRecord,
} from "./generation-jobs-store.js";
export type {
  GenerationQueue,
  GenerationJobPayload,
  EnqueueGenerationResult,
} from "./generation-queue.js";
export { InMemoryGenerationQueue } from "./generation-queue.js";
export { BullMqGenerationQueue } from "./bullmq-queue.js";
export type { BullMqGenerationQueueOptions } from "./bullmq-queue.js";
export { generationRoutes } from "./generation-routes.js";
export type { GenerationRouteOptions } from "./generation-routes.js";
export { ReviewService } from "./review-service.js";
export type {
  ReviewQueueResource,
  ReviewQueueResponse,
  ContentReviewResource,
  AcceptContentResult,
  RejectContentResult,
  RegenerateContentResult,
} from "./review-service.js";
export { reviewRoutes } from "./review-routes.js";
export type { ReviewRouteOptions } from "./review-routes.js";
