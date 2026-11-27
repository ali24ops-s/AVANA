/**
 * AVANA Pocket — Assertion Published Delivery Handler (Phase 2C-4C).
 *
 * Minimal concrete consumer for "assertion.published" outbox events:
 * 1. Implements the existing PocketEventDeliveryHandler contract.
 * 2. Validates event payload against the authoritative publication contract.
 * 3. Enforces required fields: assertionId, aggregateType, aggregateId, entityVersion.
 * 4. Respects the AbortSignal cancellation contract.
 * 5. Emits a concise structured delivery log for observability.
 * 6. Returns cleanly on valid delivery so PocketEventProcessor can mark the
 *    PostgreSQL pocket_outbox record as 'sent'.
 *
 * PostgreSQL publication is already complete and authoritative. The handler
 * has no mutable business side effects and is naturally idempotent.
 */

import {
  VALID_CLINICAL_AGGREGATE_TYPES,
  type ClinicalAggregateType,
} from "./assertion-consumption-store.js";
import type {
  PocketEventDeliveryHandler,
  PocketEventPayload,
} from "./pocket-event-handler.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AssertionPublishedHandlerOptions {
  logger?: (msg: string) => void;
}

export class AssertionPublishedHandler implements PocketEventDeliveryHandler {
  readonly eventType = "assertion.published";
  private readonly logger: (msg: string) => void;

  constructor(opts?: AssertionPublishedHandlerOptions) {
    this.logger = opts?.logger ?? (() => {});
  }

  async handle(event: PocketEventPayload, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error(signal.reason ? String(signal.reason) : "Handler execution aborted");
    }

    const payload = event.payload;
    if (!payload || typeof payload !== "object") {
      throw new Error(
        `[AssertionPublishedHandler] Invalid event payload for event '${event.id}': payload must be an object.`,
      );
    }

    const { assertionId, aggregateType, aggregateId, entityVersion } = payload;

    // 1. Validate assertionId (UUID)
    if (typeof assertionId !== "string" || !UUID_REGEX.test(assertionId)) {
      throw new Error(
        `[AssertionPublishedHandler] Invalid assertionId in event '${event.id}': expected valid UUID, received '${String(assertionId)}'.`,
      );
    }

    // 2. Validate aggregateType
    if (
      typeof aggregateType !== "string" ||
      !VALID_CLINICAL_AGGREGATE_TYPES.includes(aggregateType as ClinicalAggregateType)
    ) {
      throw new Error(
        `[AssertionPublishedHandler] Invalid aggregateType in event '${event.id}': expected one of [${VALID_CLINICAL_AGGREGATE_TYPES.join(", ")}], received '${String(aggregateType)}'.`,
      );
    }

    // 3. Validate aggregateId (UUID)
    if (typeof aggregateId !== "string" || !UUID_REGEX.test(aggregateId)) {
      throw new Error(
        `[AssertionPublishedHandler] Invalid aggregateId in event '${event.id}': expected valid UUID, received '${String(aggregateId)}'.`,
      );
    }

    // 4. Validate entityVersion (positive integer >= 1)
    if (
      typeof entityVersion !== "number" ||
      !Number.isInteger(entityVersion) ||
      entityVersion < 1
    ) {
      throw new Error(
        `[AssertionPublishedHandler] Invalid entityVersion in event '${event.id}': expected positive integer >= 1, received '${String(entityVersion)}'.`,
      );
    }

    // 5. Check signal again before concluding
    if (signal.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error(signal.reason ? String(signal.reason) : "Handler execution aborted");
    }

    // 6. Concise structured delivery log
    this.logger(
      `[AssertionPublishedHandler] Delivered event '${event.id}': assertion '${assertionId}' for ${aggregateType} '${aggregateId}' at entityVersion ${entityVersion}.`,
    );
  }
}
