/**
 * GeminiKeyPool unit tests.
 *
 * Verifies:
 * - Single and multi-key initialization and deduplication.
 * - Key selection via Round-Robin / LRU.
 * - Key state transitions: healthy -> rate_limited / quota_exhausted / invalid.
 * - Automatic recovery of rate_limited keys after cooldown.
 * - Secret sanitization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DomainError } from "@avana/domain";
import { GeminiKeyPool } from "./gemini-key-pool.js";

describe("GeminiKeyPool Unit Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws unprocessable if no valid keys are provided", () => {
    expect(() => new GeminiKeyPool([])).toThrow(DomainError);
    expect(() => new GeminiKeyPool(["", "   "])).toThrow(DomainError);
  });

  it("deduplicates keys and assigns human-readable ids", () => {
    const pool = new GeminiKeyPool(["key-a", "key-b", "key-a", "  key-b  "]);
    expect(pool.size).toBe(2);
    const summary = pool.getSlotsSummary();
    expect(summary).toEqual([
      { id: "key-1", state: "healthy", cooldownUntil: null },
      { id: "key-2", state: "healthy", cooldownUntil: null },
    ]);
  });

  it("selects healthy keys in Round-Robin / LRU order", () => {
    const pool = new GeminiKeyPool(["key-a", "key-b"]);

    const slot1 = pool.acquireKey();
    expect(slot1.id).toBe("key-1");
    expect(slot1.apiKey).toBe("key-a");

    const slot2 = pool.acquireKey();
    expect(slot2.id).toBe("key-2");
    expect(slot2.apiKey).toBe("key-b");

    // Next acquisition should pick key-1 again (oldest lastUsedAt)
    const slot3 = pool.acquireKey();
    expect(slot3.id).toBe("key-1");
  });

  it("handles rate_limited state and cooldown recovery", () => {
    const pool = new GeminiKeyPool(["key-1", "key-2"]);

    const s1 = pool.acquireKey();
    pool.reportFailure(s1.id, "rate_limited", 30_000); // 30s cooldown

    // Subsequent acquisitions should pick key-2
    const s2 = pool.acquireKey();
    expect(s2.id).toBe("key-2");

    const s2Next = pool.acquireKey();
    expect(s2Next.id).toBe("key-2");

    // Advance time by 31 seconds
    vi.advanceTimersByTime(31_000);

    // key-1 should be recovered and selectable again
    const s1Recovered = pool.acquireKey();
    expect(s1Recovered.id).toBe("key-1");
  });

  it("permanently disables invalid keys", () => {
    const pool = new GeminiKeyPool(["key-bad", "key-good"]);

    const s1 = pool.acquireKey();
    pool.reportFailure(s1.id, "invalid");

    // Advance time by 10 days
    vi.advanceTimersByTime(10 * 24 * 60 * 60 * 1000);

    // key-bad should remain invalid and never be selected
    const s2 = pool.acquireKey();
    expect(s2.id).toBe("key-2");
    expect(s2.apiKey).toBe("key-good");
  });

  it("throws rate_limit_exceeded when all keys are unavailable", () => {
    const pool = new GeminiKeyPool(["key-1", "key-2"]);

    const s1 = pool.acquireKey();
    pool.reportFailure(s1.id, "quota_exhausted", 3600_000);

    const s2 = pool.acquireKey();
    pool.reportFailure(s2.id, "rate_limited", 60_000);

    expect(() => pool.acquireKey()).toThrowError(
      /All configured Gemini API keys \(2\/2\) are currently unavailable/,
    );
  });

  it("sanitizes all managed keys from error messages", () => {
    const pool = new GeminiKeyPool(["secret-key-1", "secret-key-2"]);
    const rawError = "Failed with secret-key-1 and secret-key-2 in stacktrace";
    const sanitized = pool.sanitize(rawError);
    expect(sanitized).toBe("Failed with [REDACTED] and [REDACTED] in stacktrace");
  });
});
