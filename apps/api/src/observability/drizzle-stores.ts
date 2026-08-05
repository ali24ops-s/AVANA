/**
 * Drizzle-backed implementation of AuditStore.
 *
 * Implements the AuditStore interface defined in audit-store.ts.
 * Wires into the audit_logs table for durable storage.
 *
 * Date handling: PostgreSQL timestamptz values are mapped to ISO strings
 * on read to match the domain shape expected by in-memory stores.
 */

import type { DbClient } from "@avana/database/client";
import { auditLogs } from "@avana/database/schema";
import type { AuditStore } from "./audit-store.js";
import type { AuditEvent, AuditAction, AuditEntityType } from "@avana/domain";
import type { OrganizationId, UserId } from "@avana/domain";

// ---------------------------------------------------------------------------
// DrizzleAuditStore
// ---------------------------------------------------------------------------

export class DrizzleAuditStore implements AuditStore {
  constructor(private readonly db: DbClient) {}

  async append(events: readonly AuditEvent[]): Promise<void> {
    for (const event of events) {
      await this.db.insert(auditLogs).values({
        actorId: event.actorId,
        organizationId: event.organizationId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        details: event.details as Record<string, unknown> | null | undefined,
      });
    }
  }

  async listAll(): Promise<readonly AuditEvent[]> {
    const rows = await this.db
      .select()
      .from(auditLogs)
      .orderBy(auditLogs.createdAt);

    return rows.map((row) => {
      const event: AuditEvent = {
        actorId: (row.actorId ?? null) as UserId | null,
        organizationId: (row.organizationId ?? null) as OrganizationId | null,
        action: row.action as AuditAction,
        entityType: row.entityType as AuditEntityType,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
      };
      if (row.details) {
        event.details = row.details as Record<
          string,
          string | number | boolean | readonly string[] | null | undefined
        >;
      }
      return event;
    });
  }
}
