/**
 * AVANA Pocket — Safety Override Store Interface & In-Memory Implementation (Phase D.3).
 *
 * Manages operational persistence for `pocket_safety_overrides` and
 * append-only `pocket_safety_override_events`.
 */

import { randomUUID } from "node:crypto";
import { DomainError } from "@avana/domain";
import type { TransactionClient } from "@avana/database/client";

export type SafetyOverrideTargetType =
  | "assertion"
  | "drug"
  | "disease"
  | "treatment"
  | "emergency";

export type SafetyOverrideActionState = "active" | "cleared";

export type SafetyOverrideEventType = "activated" | "cleared";

export interface SafetyOverrideRecord {
  id: string;
  targetEntityType: SafetyOverrideTargetType;
  targetEntityId: string;
  actionState: SafetyOverrideActionState;
  isActive: boolean;
  currentEventId: string | null;
  updatedAt: Date;
}

export interface SafetyOverrideEventRecord {
  id: string;
  overrideId: string;
  eventType: SafetyOverrideEventType;
  targetEntityType: SafetyOverrideTargetType;
  targetEntityId: string;
  actorUserId: string;
  reason: string;
  previousState: SafetyOverrideActionState | null;
  newState: SafetyOverrideActionState;
  eventTimestamp: Date;
}

export interface CreateSafetyOverrideInput {
  id?: string;
  targetEntityType: SafetyOverrideTargetType;
  targetEntityId: string;
  actionState: SafetyOverrideActionState;
  isActive: boolean;
}

export interface AppendSafetyOverrideEventInput {
  id?: string;
  overrideId: string;
  eventType: SafetyOverrideEventType;
  targetEntityType: SafetyOverrideTargetType;
  targetEntityId: string;
  actorUserId: string;
  reason: string;
  previousState: SafetyOverrideActionState | null;
  newState: SafetyOverrideActionState;
}

export interface ListSafetyOverridesOptions {
  targetEntityType?: SafetyOverrideTargetType;
  targetEntityId?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export interface SafetyOverrideStore {
  findById(id: string, tx?: TransactionClient): Promise<SafetyOverrideRecord | null>;

  findByIdForUpdate(id: string, tx?: TransactionClient): Promise<SafetyOverrideRecord | null>;

  findActiveByTarget(
    targetEntityType: SafetyOverrideTargetType,
    targetEntityId: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord | null>;

  findActiveByTargetForUpdate(
    targetEntityType: SafetyOverrideTargetType,
    targetEntityId: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord | null>;

  createOverride(
    input: CreateSafetyOverrideInput,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord>;

  clearOverride(
    id: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord>;

  setCurrentEventId(
    overrideId: string,
    eventId: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord>;

  appendEvent(
    input: AppendSafetyOverrideEventInput,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideEventRecord>;

  listOverrides(
    options?: ListSafetyOverridesOptions,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideRecord[]>;

  listEventsByOverrideId(
    overrideId: string,
    tx?: TransactionClient,
  ): Promise<SafetyOverrideEventRecord[]>;
}

export class InMemorySafetyOverrideStore implements SafetyOverrideStore {
  private readonly overrides = new Map<string, SafetyOverrideRecord>();
  private readonly events: SafetyOverrideEventRecord[] = [];

  async findById(id: string): Promise<SafetyOverrideRecord | null> {
    const rec = this.overrides.get(id);
    return rec ? { ...rec } : null;
  }

  async findByIdForUpdate(id: string): Promise<SafetyOverrideRecord | null> {
    return this.findById(id);
  }

  async findActiveByTarget(
    targetEntityType: SafetyOverrideTargetType,
    targetEntityId: string,
  ): Promise<SafetyOverrideRecord | null> {
    for (const rec of this.overrides.values()) {
      if (
        rec.targetEntityType === targetEntityType &&
        rec.targetEntityId === targetEntityId &&
        rec.isActive
      ) {
        return { ...rec };
      }
    }
    return null;
  }

  async findActiveByTargetForUpdate(
    targetEntityType: SafetyOverrideTargetType,
    targetEntityId: string,
  ): Promise<SafetyOverrideRecord | null> {
    return this.findActiveByTarget(targetEntityType, targetEntityId);
  }

  async createOverride(input: CreateSafetyOverrideInput): Promise<SafetyOverrideRecord> {
    if (input.isActive) {
      for (const existing of this.overrides.values()) {
        if (
          existing.targetEntityType === input.targetEntityType &&
          existing.targetEntityId === input.targetEntityId &&
          existing.isActive
        ) {
          throw new DomainError(
            "conflict",
            `An active safety override already exists for ${input.targetEntityType}:${input.targetEntityId}`,
          );
        }
      }
    }

    const id = input.id ?? randomUUID();
    const record: SafetyOverrideRecord = {
      id,
      targetEntityType: input.targetEntityType,
      targetEntityId: input.targetEntityId,
      actionState: input.actionState,
      isActive: input.isActive,
      currentEventId: null,
      updatedAt: new Date(),
    };
    this.overrides.set(id, record);
    return { ...record };
  }

  async clearOverride(id: string): Promise<SafetyOverrideRecord> {
    const existing = this.overrides.get(id);
    if (!existing) {
      throw new DomainError("not_found", `Safety override ${id} not found`);
    }

    const updated: SafetyOverrideRecord = {
      ...existing,
      actionState: "cleared",
      isActive: false,
      updatedAt: new Date(),
    };
    this.overrides.set(id, updated);
    return { ...updated };
  }

  async setCurrentEventId(overrideId: string, eventId: string): Promise<SafetyOverrideRecord> {
    const existing = this.overrides.get(overrideId);
    if (!existing) {
      throw new DomainError("not_found", `Safety override ${overrideId} not found`);
    }
    const updated: SafetyOverrideRecord = {
      ...existing,
      currentEventId: eventId,
      updatedAt: new Date(),
    };
    this.overrides.set(overrideId, updated);
    return { ...updated };
  }

  async appendEvent(input: AppendSafetyOverrideEventInput): Promise<SafetyOverrideEventRecord> {
    const event: SafetyOverrideEventRecord = {
      id: input.id ?? randomUUID(),
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
    this.events.push(event);
    return { ...event };
  }

  async listOverrides(options?: ListSafetyOverridesOptions): Promise<SafetyOverrideRecord[]> {
    let items = Array.from(this.overrides.values());
    if (options?.targetEntityType) {
      items = items.filter((o) => o.targetEntityType === options.targetEntityType);
    }
    if (options?.targetEntityId) {
      items = items.filter((o) => o.targetEntityId === options.targetEntityId);
    }
    if (options?.isActive !== undefined) {
      items = items.filter((o) => o.isActive === options.isActive);
    }
    items.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    if (options?.offset) {
      items = items.slice(options.offset);
    }
    if (options?.limit) {
      items = items.slice(0, options.limit);
    }
    return items.map((o) => ({ ...o }));
  }

  async listEventsByOverrideId(overrideId: string): Promise<SafetyOverrideEventRecord[]> {
    return this.events
      .filter((e) => e.overrideId === overrideId)
      .sort((a, b) => a.eventTimestamp.getTime() - b.eventTimestamp.getTime())
      .map((e) => ({ ...e }));
  }
}
