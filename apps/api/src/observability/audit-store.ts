/**
 * AuditStore abstraction.
 *
 * Decouples audit event persistence from the database.
 * An in-memory implementation is provided for tests;
 * a Drizzle-backed implementation would be wired at composition root.
 *
 * PR-11: Centralized audit event storage migrated from per-store
 * audit event management to a dedicated AuditStore.
 */

import type { AuditEvent } from "@avana/domain";

export interface AuditStore {
  /** Append audit events for durable storage. */
  append(events: readonly AuditEvent[]): Promise<void>;

  /** Retrieve all audit events (for testing/debugging). */
  listAll(): Promise<readonly AuditEvent[]>;
}
