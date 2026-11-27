/**
 * AVANA Pocket — Safety Override Service (Phase D.3).
 *
 * Enforces strict platform_admin-only operational control over clinical
 * safety overrides (`active` | `cleared`) with append-only lifecycle events.
 * Does NOT rewrite historical assertions or duplicate Resolver logic.
 */

import { DomainError, type Actor } from "@avana/domain";
import type { DbClient, TransactionClient } from "@avana/database/client";
import { VALID_CLINICAL_AGGREGATE_TYPES } from "./assertion-consumption-store.js";
import type {
  ListSafetyOverridesOptions,
  SafetyOverrideEventRecord,
  SafetyOverrideRecord,
  SafetyOverrideStore,
  SafetyOverrideTargetType,
} from "./safety-override-store.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_TARGET_TYPES: ReadonlySet<string> = new Set<string>([
  "assertion",
  ...VALID_CLINICAL_AGGREGATE_TYPES,
]);

export interface ActivateSafetyOverrideInput {
  targetEntityType: string;
  targetEntityId: string;
  reason: string;
}

export interface ClearSafetyOverrideInput {
  overrideId: string;
  reason: string;
}

export interface SafetyOverrideWithHistory {
  override: SafetyOverrideRecord;
  events: SafetyOverrideEventRecord[];
}

export interface SafetyOverrideServiceDeps {
  safetyOverrideStore: SafetyOverrideStore;
  db?: DbClient;
}

export class SafetyOverrideService {
  private readonly store: SafetyOverrideStore;
  private readonly db?: DbClient;

  constructor(deps: SafetyOverrideServiceDeps) {
    this.store = deps.safetyOverrideStore;
    this.db = deps.db;
  }

  private assertPlatformAdmin(actor: Actor, actionDescription: string): void {
    if (!actor || !actor.userId) {
      throw new DomainError("unauthorized", "Authenticated actor identity is required");
    }
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (!isPlatformAdmin) {
      throw new DomainError(
        "forbidden",
        `Only platform_admin may ${actionDescription}`,
      );
    }
  }

  private validateTarget(
    targetEntityType: string,
    targetEntityId: string,
  ): { targetEntityType: SafetyOverrideTargetType; targetEntityId: string } {
    const normalizedType = targetEntityType ? targetEntityType.trim().toLowerCase() : "";
    if (!VALID_TARGET_TYPES.has(normalizedType)) {
      throw new DomainError(
        "bad_request",
        `Invalid safety override target type '${targetEntityType}'. Allowed types: assertion, ${VALID_CLINICAL_AGGREGATE_TYPES.join(", ")}`,
      );
    }

    const trimmedId = targetEntityId ? targetEntityId.trim() : "";
    if (!trimmedId || !UUID_REGEX.test(trimmedId)) {
      throw new DomainError(
        "bad_request",
        `Invalid targetEntityId '${targetEntityId}'. Must be a valid UUID.`,
      );
    }

    return {
      targetEntityType: normalizedType as SafetyOverrideTargetType,
      targetEntityId: trimmedId,
    };
  }

  /**
   * Activate a safety override for an assertion or clinical aggregate.
   * Rejects duplicate active overrides with 409 conflict.
   */
  async activateOverride(
    actor: Actor,
    input: ActivateSafetyOverrideInput,
  ): Promise<{ override: SafetyOverrideRecord; event: SafetyOverrideEventRecord }> {
    this.assertPlatformAdmin(actor, "activate clinical safety overrides");

    const target = this.validateTarget(input.targetEntityType, input.targetEntityId);
    const trimmedReason = input.reason ? input.reason.trim() : "";
    if (trimmedReason === "") {
      throw new DomainError(
        "bad_request",
        "A clinical or administrative reason is required to activate a safety override",
      );
    }

    const executeInTx = async (tx?: TransactionClient) => {
      const existingActive = await this.store.findActiveByTargetForUpdate(
        target.targetEntityType,
        target.targetEntityId,
        tx,
      );
      if (existingActive) {
        throw new DomainError(
          "conflict",
          `An active safety override already exists for ${target.targetEntityType}:${target.targetEntityId}`,
        );
      }

      const created = await this.store.createOverride(
        {
          targetEntityType: target.targetEntityType,
          targetEntityId: target.targetEntityId,
          actionState: "active",
          isActive: true,
        },
        tx,
      );

      const event = await this.store.appendEvent(
        {
          overrideId: created.id,
          eventType: "activated",
          targetEntityType: created.targetEntityType,
          targetEntityId: created.targetEntityId,
          actorUserId: actor.userId,
          reason: trimmedReason,
          previousState: null,
          newState: "active",
        },
        tx,
      );

      const override = await this.store.setCurrentEventId(created.id, event.id, tx);
      return { override, event };
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(executeInTx);
    }
    return await executeInTx();
  }

  /**
   * Clear an active safety override while preserving its append-only history.
   */
  async clearOverride(
    actor: Actor,
    input: ClearSafetyOverrideInput,
  ): Promise<{ override: SafetyOverrideRecord; event: SafetyOverrideEventRecord }> {
    this.assertPlatformAdmin(actor, "clear clinical safety overrides");

    const overrideId = input.overrideId ? input.overrideId.trim() : "";
    if (!overrideId || !UUID_REGEX.test(overrideId)) {
      throw new DomainError("bad_request", "Valid overrideId UUID is required");
    }

    const trimmedReason = input.reason ? input.reason.trim() : "";
    if (trimmedReason === "") {
      throw new DomainError(
        "bad_request",
        "A clinical or administrative reason is required to clear a safety override",
      );
    }

    const executeInTx = async (tx?: TransactionClient) => {
      const existing = await this.store.findByIdForUpdate(overrideId, tx);
      if (!existing) {
        throw new DomainError("not_found", `Safety override ${overrideId} not found`);
      }

      if (!existing.isActive || existing.actionState === "cleared") {
        throw new DomainError(
          "conflict",
          `Safety override ${overrideId} is already cleared`,
        );
      }

      await this.store.clearOverride(existing.id, tx);

      const event = await this.store.appendEvent(
        {
          overrideId: existing.id,
          eventType: "cleared",
          targetEntityType: existing.targetEntityType,
          targetEntityId: existing.targetEntityId,
          actorUserId: actor.userId,
          reason: trimmedReason,
          previousState: existing.actionState,
          newState: "cleared",
        },
        tx,
      );

      const override = await this.store.setCurrentEventId(existing.id, event.id, tx);
      return { override, event };
    };

    if (this.db && typeof this.db.transaction === "function") {
      return await this.db.transaction(executeInTx);
    }
    return await executeInTx();
  }

  async listOverrides(
    actor: Actor,
    options?: ListSafetyOverridesOptions,
  ): Promise<SafetyOverrideRecord[]> {
    this.assertPlatformAdmin(actor, "list clinical safety overrides");
    return await this.store.listOverrides(options);
  }

  async getOverrideWithHistory(
    actor: Actor,
    overrideId: string,
  ): Promise<SafetyOverrideWithHistory> {
    this.assertPlatformAdmin(actor, "inspect clinical safety override history");

    const trimmedId = overrideId ? overrideId.trim() : "";
    if (!trimmedId || !UUID_REGEX.test(trimmedId)) {
      throw new DomainError("bad_request", "Valid overrideId UUID is required");
    }

    const override = await this.store.findById(trimmedId);
    if (!override) {
      throw new DomainError("not_found", `Safety override ${trimmedId} not found`);
    }

    const events = await this.store.listEventsByOverrideId(trimmedId);
    return { override, events };
  }
}
