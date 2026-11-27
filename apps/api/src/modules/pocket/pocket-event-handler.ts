/**
 * AVANA Pocket — Event Delivery Handler & Registry (Phase 2C-4B).
 *
 * Defines contracts for consuming pocket outbox events delivered by apps/worker.
 * Handlers are registered per eventType.
 *
 * Idempotency & Delivery Guarantees:
 * - At-Least-Once Delivery: In distributed execution, worker crashes, network partitions,
 *   or lease timeouts can lead to duplicate deliveries of the same outbox event.
 * - Canonical Idempotency Key: `event.id` (the PostgreSQL `pocket_outbox` primary key UUID)
 *   is the stable, immutable idempotency key across all attempts and dispatch cycles.
 * - External Side Effects: Handlers must reuse `event.id` as the deduplication/idempotency
 *   key whenever communicating with downstream services, external APIs, or storage layers.
 * - Duplicate Tolerance: All handler implementations MUST be idempotent and safely tolerate
 *   repeated execution for the same `event.id`.
 * - BullMQ Job ID Scoping: Dynamic BullMQ Job IDs (`pocket_${outboxId}_${dispatchToken}`)
 *   prevent transport-level deduplication lockups across dispatch cycles, but they do NOT
 *   guarantee business-level idempotency. Idempotency is strictly enforced by consumer handlers.
 * - AbortSignal Contract: An AbortSignal timeout or cancellation indicates that the worker
 *   has stopped waiting for the handler; it MUST NOT be treated as proof that an external
 *   operation or downstream write did not complete.
 *
 * Version Guard Scope:
 * - Publisher-side: Monotonic versions are generated atomically in PostgreSQL
 *   `pocket_entity_version_registry` during the atomic publishing transaction (Phase 2C-3).
 * - Outbox Propagation: Monotonic version (`payload.entityVersion`) and timestamp (`globalEpoch`)
 *   are propagated intact through `pocket_outbox` and passed to `PocketEventPayload`.
 * - Consumer-side: Stale-version rejection (e.g. dropping out-of-order events where entityVersion
 *   is less than current local state) must be implemented by domain consumers in downstream phases.
 */

export interface PocketEventPayload {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  globalEpoch: number;
  attempts: number;
}

export interface PocketEventDeliveryHandler {
  readonly eventType: string;
  /**
   * Execute idempotent event delivery.
   *
   * @param event The outbox event payload with canonical event.id for deduplication.
   * @param signal AbortSignal triggered if the 25-second execution timeout is exceeded.
   */
  handle(event: PocketEventPayload, signal: AbortSignal): Promise<void>;
}

export class PocketEventHandlerRegistry {
  private readonly handlers = new Map<string, PocketEventDeliveryHandler>();

  register(handler: PocketEventDeliveryHandler): void {
    if (this.handlers.has(handler.eventType)) {
      throw new Error(`Handler for eventType '${handler.eventType}' already registered`);
    }
    this.handlers.set(handler.eventType, handler);
  }

  get(eventType: string): PocketEventDeliveryHandler | undefined {
    return this.handlers.get(eventType);
  }

  has(eventType: string): boolean {
    return this.handlers.has(eventType);
  }

  clear(): void {
    this.handlers.clear();
  }
}
