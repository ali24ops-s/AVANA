/**
 * Drizzle-backed implementation of SafetyOverrideStore (Phase D.3).
 *
 * Persists operational safety overrides in `pocket_safety_overrides` and
 * immutable lifecycle events in `pocket_safety_override_events`.
 */

import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import type { DbClient, DbRunner, TransactionClient } from "@avana/database/client";
import {
  pocketSafetyOverrides,
  pocketSafetyOverrideEvents,
} from "@avana/database/schema";
import { DomainError } from "@avana/domain";
import type {
  AppendSafetyOverrideEventInput,
  CreateSafetyOverrideInput,
  ListSafetyOverridesOptions,
  SafetyOverrideActionState,
  SafetyOverrideEventRecord,
  SafetyOverrideEventType,
  SafetyOverrideRecord,
  SafetyOverrideStore,
  SafetyOverrideTargetType,
} from "./safety-override-store.js";

type OverrideRow = typeof pocketSafetyOverrides.$inferSelect;
type OverrideEventRow = typeof pocketSafetyOverrideEvents.$inferSelect;

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function mapRowToOverride(row: OverrideRow): SafetyOverrideRecord {
  return {
    id: row.id,
    targetEntityType: row.targetEntityType as SafetyOverrideTargetType,
    targetEntityId: row.targetEntityId,
    actionState: row.actionState as SafetyOverrideActionState,
    isActive: Boolean(row.isActive),
    currentEventId: row.currentEventId ?? null,
    updatedAt: toDate(row.updatedAt),
  };
}

function mapRowToEvent(row: OverrideEventRow): SafetyOverrideEventRecord {
  return {
    id: row.id,
    overrideId: row.overrideId,
    eventType: row.eventType as SafetyOverrideEventType,
    targetEntityType: row.targetEntityType as SafetyOverrideTargetType,
    targetEntityId: row.targetEntityId,
    actorUserId: row.actorUserId,
    reason: row.reason,
    previousState: row.previousState ? (row.previousState as SafetyOverrideActionState) : null,
    newState: row.newState as SafetyOverrideActionState,
    eventTimestamp: toDate(row.eventTimestamp),
  };
}

export class DrizzleSafetyOverrideStore implements SafetyOverrideStore {
  constructor(private readonly db: DbClient) {}

  private getRunner(tx?: TransactionClient): DbRunner {
    return tx ?? this.db;
  }

  async findById(
    id: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketSafetyOverrides)
      .where(eq(pocketSafetyOverrides.id, id))
      .limit(1);

    return rows.length > 0 ? mapRowToOverride(rows[0]) : null;
  }

  async findByIdForUpdate(
    id: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord | null> {
    const runner = this.getRunner(tx);
    const baseQuery = runner
      .select()
      .from(pocketSafetyOverrides)
      .where(eq(pocketSafetyOverrides.id, id))
      .limit(1);

    const rows = tx ? await baseQuery.for("update") : await baseQuery;
    return rows.length > 0 ? mapRowToOverride(rows[0]) : null;
  }

  async findActiveByTarget(
    targetEntityType: SafetyOverrideTargetType,
    targetEntityId: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord | null> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketSafetyOverrides)
      .where(
        and(
          eq(pocketSafetyOverrides.targetEntityType, targetEntityType),
          eq(pocketSafetyOverrides.targetEntityId, targetEntityId),
          eq(pocketSafetyOverrides.isActive, true),
        ),
      )
      .limit(1);

    return rows.length > 0 ? mapRowToOverride(rows[0]) : null;
  }

  async findActiveByTargetForUpdate(
    targetEntityType: SafetyOverrideTargetType,
    targetEntityId: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord | null> {
    const runner = this.getRunner(tx);
    const baseQuery = runner
      .select()
      .from(pocketSafetyOverrides)
      .where(
        and(
          eq(pocketSafetyOverrides.targetEntityType, targetEntityType),
          eq(pocketSafetyOverrides.targetEntityId, targetEntityId),
          eq(pocketSafetyOverrides.isActive, true),
        ),
      )
      .limit(1);

    const rows = tx ? await baseQuery.for("update") : await baseQuery;
    return rows.length > 0 ? mapRowToOverride(rows[0]) : null;
  }

  async createOverride(
    input: CreateSafetyOverrideInput,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord> {
    const runner = this.getRunner(tx);

    try {
      const insertValues: typeof pocketSafetyOverrides.$inferInsert = {
        targetEntityType: input.targetEntityType,
        targetEntityId: input.targetEntityId,
        actionState: input.actionState,
        isActive: input.isActive,
        updatedAt: new Date(),
      };
      if (input.id) {
        insertValues.id = input.id;
      }

      const [row] = await runner
        .insert(pocketSafetyOverrides)
        .values(insertValues)
        .returning();

      return mapRowToOverride(row);
    } catch (err: unknown) {
      const pgErr = err as {
        code?: string;
        constraint?: string;
        message?: string;
        cause?: { code?: string; constraint?: string; message?: string };
      };
      const code = pgErr.code ?? pgErr.cause?.code;
      const constraint = pgErr.constraint ?? pgErr.cause?.constraint;
      const message = `${pgErr.message ?? ""} ${pgErr.cause?.message ?? ""}`;

      if (
        code === "23505" &&
        (constraint === "uq_single_active_override" ||
          message.includes("uq_single_active_override"))
      ) {
        throw new DomainError(
          "conflict",
          `An active safety override already exists for ${input.targetEntityType}:${input.targetEntityId}`,
        );
      }

      throw err;
    }
  }

  async clearOverride(
    id: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord> {
    const runner = this.getRunner(tx);
    const [updated] = await runner
      .update(pocketSafetyOverrides)
      .set({
        actionState: "cleared",
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(pocketSafetyOverrides.id, id))
      .returning();

    if (!updated) {
      throw new DomainError("not_found", `Safety override ${id} not found`);
    }

    return mapRowToOverride(updated);
  }

  async setCurrentEventId(
    overrideId: string,
    eventId: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord> {
    const runner = this.getRunner(tx);
    const [updated] = await runner
      .update(pocketSafetyOverrides)
      .set({
        currentEventId: eventId,
        updatedAt: new Date(),
      })
      .where(eq(pocketSafetyOverrides.id, overrideId))
      .returning();

    if (!updated) {
      throw new DomainError("not_found", `Safety override ${overrideId} not found`);
    }

    return mapRowToOverride(updated);
  }

  async appendEvent(
    input: AppendSafetyOverrideEventInput,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideEventRecord> {
    const runner = this.getRunner(tx);
    const insertValues: typeof pocketSafetyOverrideEvents.$inferInsert = {
      overrideId: input.overrideId,
      eventType: input.eventType,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      previousState: input.previousState,
      newState: input.newState,
      eventTimestamp: new Date(),
    };
    if (input.id) {
      insertValues.id = input.id;
    }

    const [row] = await runner
      .insert(pocketSafetyOverrideEvents)
      .values(insertValues)
      .returning();

    return mapRowToEvent(row);
  }

  async listOverrides(
    options?: ListSafetyOverridesOptions,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord[]> {
    const runner = this.getRunner(tx);
    const conditions: SQL[] = [];

    if (options?.targetEntityType) {
      conditions.push(eq(pocketSafetyOverrides.targetEntityType, options.targetEntityType));
    }
    if (options?.targetEntityId) {
      conditions.push(eq(pocketSafetyOverrides.targetEntityId, options.targetEntityId));
    }
    if (options?.isActive !== undefined) {
      conditions.push(eq(pocketSafetyOverrides.isActive, options.isActive));
    }

    let query = runner
      .select()
      .from(pocketSafetyOverrides)
      .orderBy(desc(pocketSafetyOverrides.updatedAt))
      .$dynamic();

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const rows = await query;
    return rows.map(mapRowToOverride);
  }

  async listEventsByOverrideId(
    overrideId: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideEventRecord[]> {
    const runner = this.getRunner(tx);
    const rows = await runner
      .select()
      .from(pocketSafetyOverrideEvents)
      .where(eq(pocketSafetyOverrideEvents.overrideId, overrideId))
      .orderBy(
        asc(pocketSafetyOverrideEvents.eventTimestamp),
        asc(pocketSafetyOverrideEvents.id),
      );

    return rows.map(mapRowToEvent);
  }
}
