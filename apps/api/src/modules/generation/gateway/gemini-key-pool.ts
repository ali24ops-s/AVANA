/**
 * GeminiKeyPool — Multi-key management, state tracking, and rotation for Gemini API keys.
 *
 * Key features:
 * - Manages multiple Gemini API keys safely without leaking secrets.
 * - Tracks key health states: "healthy" | "rate_limited" | "quota_exhausted" | "invalid".
 * - Performs Least-Recently-Used / Round-Robin selection among healthy keys.
 * - Automatically recovers "rate_limited" keys after their cooldown period expires.
 * - Sidelined "quota_exhausted" and "invalid" keys to protect quota and prevent wasteful requests.
 * - Coordinates state, cooldowns, and RPM/TPM rate limits via Redis across API and Worker processes.
 * - Groups keys by Project ID so multiple keys under one project share the same quota bucket.
 * - Supports failover to independent projects when a project's quota is exhausted.
 * - Provides secret sanitization across all managed keys.
 * - Never logs or stores raw API keys in Redis or telemetry.
 */

import { DomainError } from "@avana/domain";
import type { Redis } from "ioredis";
import {
  GeminiRateLimiter,
  type GeminiRateLimiterOptions,
  type ReservationResult,
} from "./gemini-rate-limiter.js";

export type KeyState = "healthy" | "rate_limited" | "quota_exhausted" | "invalid";

export interface KeySlotConfig {
  /** Raw secret API key. */
  apiKey: string;
  /** Human-readable identifier (e.g. "key-1", "key-2"). */
  id?: string;
  /** Non-confidential Project/Account group identifier (e.g. "project-1"). */
  projectId?: string;
}

export interface GeminiKeySlot {
  /** Human-readable identifier (e.g. "key-1", "key-2") used in logs. */
  id: string;
  /** Non-confidential Project/Account identifier. */
  projectId: string;
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

export interface GeminiKeyPoolOptions {
  keyConfigs?: KeySlotConfig[];
  apiKeys?: string[];
  redis?: Redis;
  rateLimiter?: GeminiRateLimiter;
  quotas?: GeminiRateLimiterOptions;
}

export interface AcquireSlotOptions {
  model: string;
  isInteractive?: boolean;
  estimatedTokens?: number;
  correlationId?: string;
  now?: number;
}

export interface AcquiredKeySlot {
  slot: GeminiKeySlot;
  reservationId?: string;
  estimatedTokens?: number;
}

export class GeminiKeyPool {
  private readonly slots: GeminiKeySlot[] = [];
  private readonly rateLimiter: GeminiRateLimiter;
  private readonly redis?: Redis;

  constructor(
    apiKeysOrOptions: string[] | KeySlotConfig[] | GeminiKeyPoolOptions,
    secondaryOptions?: {
      redis?: Redis;
      quotas?: GeminiRateLimiterOptions;
      rateLimiter?: GeminiRateLimiter;
    },
  ) {
    let configs: KeySlotConfig[] = [];
    let redisClient: Redis | undefined = secondaryOptions?.redis;
    let customLimiter: GeminiRateLimiter | undefined = secondaryOptions?.rateLimiter;
    let quotaOptions: GeminiRateLimiterOptions | undefined = secondaryOptions?.quotas;

    if (Array.isArray(apiKeysOrOptions)) {
      configs = apiKeysOrOptions.map((item, index) => {
        if (typeof item === "string") {
          return {
            apiKey: item,
            id: `key-${index + 1}`,
            projectId: `project-${index + 1}`,
          };
        }
        return item;
      });
    } else if (apiKeysOrOptions && typeof apiKeysOrOptions === "object") {
      redisClient = apiKeysOrOptions.redis ?? redisClient;
      customLimiter = apiKeysOrOptions.rateLimiter ?? customLimiter;
      quotaOptions = apiKeysOrOptions.quotas ?? quotaOptions;

      if (Array.isArray(apiKeysOrOptions.keyConfigs) && apiKeysOrOptions.keyConfigs.length > 0) {
        configs = apiKeysOrOptions.keyConfigs;
      } else if (Array.isArray(apiKeysOrOptions.apiKeys)) {
        configs = apiKeysOrOptions.apiKeys.map((key, index) => ({
          apiKey: key,
          id: `key-${index + 1}`,
          projectId: `project-${index + 1}`,
        }));
      }
    }

    // Filter and deduplicate unique non-empty keys
    const seenKeys = new Set<string>();
    const sanitizedConfigs: KeySlotConfig[] = [];

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      const trimmed = cfg.apiKey ? cfg.apiKey.trim() : "";
      if (trimmed.length > 0 && !seenKeys.has(trimmed)) {
        seenKeys.add(trimmed);
        sanitizedConfigs.push({
          apiKey: trimmed,
          id: cfg.id || `key-${sanitizedConfigs.length + 1}`,
          projectId: cfg.projectId || `project-${sanitizedConfigs.length + 1}`,
        });
      }
    }

    if (sanitizedConfigs.length === 0) {
      throw new DomainError(
        "unprocessable",
        "At least one valid Gemini API key must be provided",
      );
    }

    this.slots = sanitizedConfigs.map((cfg, index) => ({
      id: cfg.id || `key-${index + 1}`,
      projectId: cfg.projectId || `project-${index + 1}`,
      apiKey: cfg.apiKey,
      state: "healthy",
      cooldownUntil: null,
      failureCount: 0,
      lastUsedAt: null,
    }));

    this.redis = redisClient;
    this.rateLimiter =
      customLimiter ??
      new GeminiRateLimiter({
        redis: this.redis,
        ...quotaOptions,
      });
  }

  /**
   * Total number of keys in the pool.
   */
  get size(): number {
    return this.slots.length;
  }

  /**
   * Access underlying rate limiter instance.
   */
  getRateLimiter(): GeminiRateLimiter {
    return this.rateLimiter;
  }

  /**
   * Check if any other project has healthy keys (used for intelligent failover).
   */
  hasOtherHealthyProjects(excludeProjectId: string): boolean {
    const now = Date.now();
    return this.slots.some((s) => {
      if (s.projectId === excludeProjectId) return false;
      if (s.state === "invalid") return false;
      if (
        (s.state === "rate_limited" || s.state === "quota_exhausted") &&
        s.cooldownUntil !== null &&
        s.cooldownUntil > now
      ) {
        return false;
      }
      return true;
    });
  }

  /**
   * Helper to recover any rate_limited or quota_exhausted keys whose cooldown has expired.
   */
  private recoverExpiredCooldowns(now: number): void {
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
  }

  /**
   * Synchronous acquire key slot using Least-Recently-Used / Round-Robin.
   * Preserved for backward compatibility with synchronous callers and unit tests.
   */
  acquireKey(): GeminiKeySlot {
    const now = Date.now();
    this.recoverExpiredCooldowns(now);

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
   * Asynchronously acquire a healthy key slot with distributed rate limiting and capacity reservation.
   * Evaluates all healthy keys in LRU order, reserves quota atomically via Redis,
   * and groups keys by project to prevent double-counting.
   */
  async acquireKeySlotAsync(options: AcquireSlotOptions): Promise<AcquiredKeySlot> {
    const now = options.now ?? Date.now();
    this.recoverExpiredCooldowns(now);

    // Sync remote slot states from Redis if running distributed
    if (this.rateLimiter.isDistributed()) {
      await Promise.all(
        this.slots.map(async (slot) => {
          const remoteState = await this.rateLimiter.getSlotState(slot.projectId, slot.id);
          if (remoteState) {
            if (remoteState.lastUsedAt !== null && remoteState.lastUsedAt !== undefined) {
              slot.lastUsedAt = remoteState.lastUsedAt;
            }
            if (remoteState.state === "invalid") {
              slot.state = "invalid";
            }
          }
        }),
      );
    }

    // 2. Filter candidate healthy slots
    const candidates = this.slots.filter((s) => s.state === "healthy");

    if (candidates.length === 0) {
      const summary = this.getDetailedSlotsSummary()
        .map((s) => `${s.id} (${s.projectId}): ${s.state}`)
        .join(", ");
      throw new DomainError(
        "rate_limit_exceeded",
        `All configured Gemini API keys (${this.slots.length}/${this.slots.length}) are currently unavailable (${summary})`,
      );
    }

    // 3. Sort by LRU (least recently used first)
    candidates.sort((a, b) => {
      if (a.lastUsedAt === null && b.lastUsedAt === null) return 0;
      if (a.lastUsedAt === null) return -1;
      if (b.lastUsedAt === null) return 1;
      return a.lastUsedAt - b.lastUsedAt;
    });

    const estimatedTokens = options.estimatedTokens ?? 1000;
    let minRetryAfterMs = 60_000;
    let lastDenialReason: ReservationResult["reason"] = "rpm_exceeded";
    const evaluatedProjects = new Set<string>();

    // 4. Evaluate candidates against the distributed rate limiter
    for (const slot of candidates) {
      // If we already know this project is rate limited in this cycle, skip duplicate keys in same project
      if (evaluatedProjects.has(slot.projectId)) {
        continue;
      }

      const res = await this.rateLimiter.reserveCapacity({
        projectId: slot.projectId,
        slotId: slot.id,
        model: options.model,
        estimatedTokens,
        isInteractive: options.isInteractive,
        now,
      });

      if (res.allowed) {
        slot.lastUsedAt = now;
        return {
          slot,
          reservationId: res.reservationId,
          estimatedTokens,
        };
      }

      evaluatedProjects.add(slot.projectId);
      if (res.retryAfterMs && res.retryAfterMs < minRetryAfterMs) {
        minRetryAfterMs = res.retryAfterMs;
      }
      if (res.reason) {
        lastDenialReason = res.reason;
      }
    }

    // All available projects are currently rate-limited
    const waitSec = Math.max(1, Math.ceil(minRetryAfterMs / 1000));
    throw new DomainError(
      "rate_limit_exceeded",
      `Gemini rate limit exceeded for all available projects (${lastDenialReason}). Retry in ${waitSec}s.`,
    );
  }

  /**
   * Report successful execution for a slot (synchronous).
   */
  reportSuccess(slotId: string): void {
    const slot = this.slots.find((s) => s.id === slotId);
    if (slot && slot.state === "healthy") {
      slot.failureCount = 0;
    }
  }

  /**
   * Report successful execution with distributed token adjustment.
   */
  async reportSuccessAsync(
    slotId: string,
    options?: { reservationId?: string; actualTokens?: number },
  ): Promise<void> {
    this.reportSuccess(slotId);
    const slot = this.slots.find((s) => s.id === slotId);
    if (!slot) return;

    if (options?.reservationId) {
      await this.rateLimiter.adjustOrReleaseReservation(
        slot.projectId,
        options.reservationId,
        options.actualTokens,
      );
    }

    await this.rateLimiter.reportSlotState({
      projectId: slot.projectId,
      slotId: slot.id,
      state: "healthy",
    });
  }

  /**
   * Report failure for a slot (synchronous).
   */
  reportFailure(
    slotId: string,
    reason: "invalid" | "quota_exhausted" | "rate_limited" | "server_error",
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
      slot.cooldownUntil = now + (cooldownMs ?? 24 * 60 * 60 * 1000);
    } else if (reason === "rate_limited") {
      slot.state = "rate_limited";
      slot.cooldownUntil = now + (cooldownMs ?? 30_000);
    }
  }

  /**
   * Report failure with distributed Cooldown update and reservation cancellation.
   */
  async reportFailureAsync(
    slotId: string,
    reason: "invalid" | "quota_exhausted" | "rate_limited" | "server_error",
    cooldownMs?: number,
    options?: { reservationId?: string },
  ): Promise<void> {
    this.reportFailure(slotId, reason, cooldownMs);
    const slot = this.slots.find((s) => s.id === slotId);
    if (!slot) return;

    if (options?.reservationId) {
      // Release estimated tokens on failure
      await this.rateLimiter.adjustOrReleaseReservation(
        slot.projectId,
        options.reservationId,
        -1,
      );
    }

    if (reason !== "server_error") {
      await this.rateLimiter.reportSlotState({
        projectId: slot.projectId,
        slotId: slot.id,
        state: reason,
        cooldownMs,
      });
    }
  }

  /**
   * Release an active reservation when a request is cancelled or times out.
   */
  async releaseReservationAsync(slotId: string, reservationId?: string): Promise<void> {
    if (!reservationId) return;
    const slot = this.slots.find((s) => s.id === slotId);
    if (!slot) return;
    await this.rateLimiter.adjustOrReleaseReservation(slot.projectId, reservationId, -1);
  }

  /**
   * Check if the pool is connected to distributed Redis rate limiting.
   */
  isDistributed(): boolean {
    return this.rateLimiter.isDistributed();
  }

  /**
   * Check whether any other healthy projects/keys exist that can be failed over to (async, checks Redis if configured).
   */
  async hasOtherHealthyProjectsAsync(currentSlotId: string, reason?: string): Promise<boolean> {
    const currentSlot = this.slots.find((s) => s.id === currentSlotId);
    const now = Date.now();
    this.recoverExpiredCooldowns(now);

    for (const slot of this.slots) {
      if (slot.id === currentSlotId) continue;
      // If failure was project-level (quota or rate limit), ignore other slots in the same project
      if (
        (reason === "quota_exhausted" || reason === "rate_limited") &&
        currentSlot &&
        slot.projectId === currentSlot.projectId
      ) {
        continue;
      }
      if (slot.state === "invalid") continue;
      if (slot.cooldownUntil && slot.cooldownUntil > now) continue;

      if (this.rateLimiter.isDistributed()) {
        const state = await this.rateLimiter.getSlotState(slot.projectId, slot.id);
        if (state && (state.state === "invalid" || (state.cooldownUntil && state.cooldownUntil > now))) {
          continue;
        }
      }
      return true;
    }
    return false;
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
  getSlotsSummary(): Array<{
    id: string;
    state: KeyState;
    cooldownUntil: number | null;
  }> {
    return this.slots.map((s) => ({
      id: s.id,
      state: s.state,
      cooldownUntil: s.cooldownUntil,
    }));
  }

  /**
   * Return detailed summary including project IDs.
   */
  getDetailedSlotsSummary(): Array<{
    id: string;
    projectId: string;
    state: KeyState;
    cooldownUntil: number | null;
  }> {
    return this.slots.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      state: s.state,
      cooldownUntil: s.cooldownUntil,
    }));
  }
}
