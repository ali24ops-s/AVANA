/**
 * GeminiKeyPool — Multi-key management, state tracking, and rotation for Gemini API keys.
 *
 * Key features:
 * - Manages multiple Gemini API keys safely without leaking secrets.
 * - Tracks key health states: "healthy" | "rate_limited" | "quota_exhausted" | "invalid".
 * - Performs Least-Recently-Used / Round-Robin selection among healthy keys.
 * - Automatically recovers "rate_limited" keys after their cooldown period expires.
 * - Sidelined "quota_exhausted" and "invalid" keys to protect quota and prevent wasteful requests.
 * - Provides secret sanitization across all managed keys.
 */

import { DomainError } from "@avana/domain";

export type KeyState = "healthy" | "rate_limited" | "quota_exhausted" | "invalid";

export interface GeminiKeySlot {
  /** Human-readable identifier (e.g. "key-1", "key-2") used in logs. */
  id: string;
  /** Raw secret API key. */
  apiKey: string;
  /** Current health state. */
  state: KeyState;
  /** Timestamp when cooldown expires (for rate_limited or quota_exhausted keys). */
  cooldownUntil: number | null;
  /** Consecutive failure counter. */
  failureCount: number;
  /** Timestamp of last acquisition. */
  lastUsedAt: number | null;
}

export class GeminiKeyPool {
  private readonly slots: GeminiKeySlot[] = [];

  constructor(apiKeys: string[]) {
    const uniqueKeys = Array.from(
      new Set(apiKeys.map((k) => k.trim()).filter((k) => k.length > 0)),
    );

    if (uniqueKeys.length === 0) {
      throw new DomainError(
        "unprocessable",
        "At least one valid Gemini API key must be provided",
      );
    }

    this.slots = uniqueKeys.map((key, index) => ({
      id: `key-${index + 1}`,
      apiKey: key,
      state: "healthy",
      cooldownUntil: null,
      failureCount: 0,
      lastUsedAt: null,
    }));
  }

  /**
   * Total number of keys in the pool.
   */
  get size(): number {
    return this.slots.length;
  }

  /**
   * Acquire a healthy API key slot using Least-Recently-Used / Round-Robin.
   * Automatically restores rate_limited keys whose cooldown period has elapsed.
   */
  acquireKey(): GeminiKeySlot {
    const now = Date.now();

    // 1. Restore any rate_limited or quota_exhausted key whose cooldown has expired
    for (const slot of this.slots) {
      if (
        (slot.state === "rate_limited" || slot.state === "quota_exhausted") &&
        slot.cooldownUntil !== null &&
        now >= slot.cooldownUntil
      ) {
        slot.state = "healthy";
        slot.cooldownUntil = null;
        slot.failureCount = 0;
      }
    }

    // 2. Filter available healthy keys
    const healthySlots = this.slots.filter((s) => s.state === "healthy");

    if (healthySlots.length === 0) {
      const summary = this.getSlotsSummary()
        .map((s) => `${s.id}: ${s.state}`)
        .join(", ");
      throw new DomainError(
        "rate_limit_exceeded",
        `All configured Gemini API keys (${this.slots.length}/${this.slots.length}) are currently unavailable (${summary})`,
      );
    }

    // 3. Select key with oldest lastUsedAt (null first for unused keys)
    healthySlots.sort((a, b) => {
      if (a.lastUsedAt === null && b.lastUsedAt === null) return 0;
      if (a.lastUsedAt === null) return -1;
      if (b.lastUsedAt === null) return 1;
      return a.lastUsedAt - b.lastUsedAt;
    });

    const chosen = healthySlots[0];
    chosen.lastUsedAt = now;
    return chosen;
  }

  /**
   * Report successful execution for a slot.
   */
  reportSuccess(slotId: string): void {
    const slot = this.slots.find((s) => s.id === slotId);
    if (slot && slot.state === "healthy") {
      slot.failureCount = 0;
    }
  }

  /**
   * Report failure for a slot and update its state accordingly.
   */
  reportFailure(
    slotId: string,
    reason: "invalid" | "quota_exhausted" | "rate_limited",
    cooldownMs?: number,
  ): void {
    const slot = this.slots.find((s) => s.id === slotId);
    if (!slot) return;

    const now = Date.now();
    slot.failureCount += 1;

    if (reason === "invalid") {
      slot.state = "invalid";
      slot.cooldownUntil = null;
    } else if (reason === "quota_exhausted") {
      slot.state = "quota_exhausted";
      // Default daily quota cooldown: 24 hours
      slot.cooldownUntil = now + (cooldownMs ?? 24 * 60 * 60 * 1000);
    } else if (reason === "rate_limited") {
      slot.state = "rate_limited";
      // Default transient rate-limit cooldown: 30 seconds
      slot.cooldownUntil = now + (cooldownMs ?? 30_000);
    }
  }

  /**
   * Sanitize text by redacting all API keys managed in this pool.
   */
  sanitize(text: string): string {
    let result = text;
    for (const slot of this.slots) {
      if (slot.apiKey) {
        result = result.split(slot.apiKey).join("[REDACTED]");
      }
    }
    return result;
  }

  /**
   * Returns all raw API keys in the pool (for sanitization helper).
   */
  getAllKeys(): string[] {
    return this.slots.map((s) => s.apiKey);
  }

  /**
   * Return human-readable summary of slot states without secret keys.
   */
  getSlotsSummary(): Array<{ id: string; state: KeyState; cooldownUntil: number | null }> {
    return this.slots.map((s) => ({
      id: s.id,
      state: s.state,
      cooldownUntil: s.cooldownUntil,
    }));
  }
}
