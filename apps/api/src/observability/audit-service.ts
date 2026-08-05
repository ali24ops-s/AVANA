/**
 * AuditService — wraps AuditStore with optional pre/post hooks.
 *
 * PR-11: Provides a centralized audit emission point so that
 * organization and course services do not manage audit events
 * directly. Backward compatible: existing callers that previously
 * passed audit events through store params can emit via this service
 * instead.
 */

import type { AuditEvent } from "@avana/domain";
import type { AuditStore } from "./audit-store.js";

export class AuditService {
  constructor(private readonly store: AuditStore) {}

  /**
   * Emit one or more audit events.
   * Events are forwarded to the store for persistence.
   */
  async emit(events: readonly AuditEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.store.append(events);
  }

  /**
   * Retrieve all stored audit events (testing/debugging).
   */
  async listAll(): Promise<readonly AuditEvent[]> {
    return this.store.listAll();
  }
}
