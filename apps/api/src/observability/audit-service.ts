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

export type AuditEventListener = (events: readonly AuditEvent[]) => void | Promise<void>;

export class AuditService {
  private readonly listeners: AuditEventListener[] = [];

  constructor(private readonly store: AuditStore) {}

  /**
   * Register a non-blocking observer/tap for emitted audit events.
   */
  addListener(listener: AuditEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Emit one or more audit events.
   * Events are forwarded to the store for persistence.
   * Registered listeners are tapped asynchronously in an isolated fire-and-forget manner.
   */
  async emit(events: readonly AuditEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.store.append(events);

    // Fire-and-forget: listeners NEVER block or fail the emit operation
    for (const listener of this.listeners) {
      try {
        const res = listener(events);
        if (res && typeof (res as Promise<void>).catch === "function") {
          void (res as Promise<void>).catch(() => {
            // Suppress async listener errors
          });
        }
      } catch {
        // Suppress sync listener errors
      }
    }
  }

  /**
   * Retrieve all stored audit events (testing/debugging).
   */
  async listAll(): Promise<readonly AuditEvent[]> {
    return this.store.listAll();
  }
}
