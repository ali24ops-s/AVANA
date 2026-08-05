/**
 * In-memory AuditStore for testing.
 */

import type { AuditEvent } from "@avana/domain";
import type { AuditStore } from "../audit-store.js";

export class InMemoryAuditStore implements AuditStore {
  private events: AuditEvent[] = [];

  async append(events: readonly AuditEvent[]): Promise<void> {
    this.events.push(...events);
  }

  async listAll(): Promise<readonly AuditEvent[]> {
    return [...this.events];
  }
}
