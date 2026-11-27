/**
 * AVANA Worker — Pocket Event Processor (Phase 2C-4B).
 *
 * Re-exports processor and worker factory from @avana/api.
 */

export {
  createPocketEventWorker,
  processPocketEventJob,
  type PocketEventProcessorDeps,
  type CreatePocketEventWorkerOptions,
} from "@avana/api/pocket/pocket-event-processor";

export {
  PocketEventHandlerRegistry,
  type PocketEventDeliveryHandler,
  type PocketEventPayload,
} from "@avana/api/pocket/pocket-event-handler";

export {
  AssertionPublishedHandler,
  type AssertionPublishedHandlerOptions,
} from "@avana/api/pocket/assertion-published-handler";
