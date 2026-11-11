/**
 * Chemical Structure & Identity Cache Service for AVANA.
 *
 * Implements two-tier caching:
 * - L1: In-memory LRU / Map cache (ultra-fast, zero network)
 * - L2: Redis cache (shared across worker instances)
 *
 * Full Fault Tolerance:
 * If Redis is unavailable or encounters connection errors, all operations gracefully
 * degrade to the in-memory cache without throwing exceptions.
 */

import type { ScientificCompoundData } from "./types.js";
import type { Redis } from "ioredis";

export interface CacheOptions {
  positiveTtlSeconds?: number; // Default 30 days (2592000s)
  negativeTtlSeconds?: number; // Default 30 minutes (1800s) for unfound/invalid
  maxMemoryEntries?: number;   // Default 500
}

interface CacheEntry {
  data: ScientificCompoundData | null;
  expiresAt: number;
}

export class ChemicalCacheService {
  private readonly memoryCache = new Map<string, CacheEntry>();
  private readonly positiveTtlMs: number;
  private readonly negativeTtlMs: number;
  private readonly maxMemoryEntries: number;
  private redisWarned = false;

  constructor(
    private readonly redisClient?: Redis | null,
    options?: CacheOptions,
  ) {
    this.positiveTtlMs = (options?.positiveTtlSeconds ?? 2592000) * 1000;
    this.negativeTtlMs = (options?.negativeTtlSeconds ?? 1800) * 1000;
    this.maxMemoryEntries = options?.maxMemoryEntries ?? 500;
  }

  private normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/[\u200c\u200b\u200e\u200f\ufeff]/g, "")
      .replace(/[\u0643]/g, "ک")
      .replace(/[\u064a\u0649]/g, "ی")
      .replace(/[-_.,;:/[\]()|\\«»""''“”‘’؛،—–−•·*~?!]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private getRedisKey(normalizedKey: string): string {
    return `chem:v1:identity:${encodeURIComponent(normalizedKey)}`;
  }

  /**
   * Retrieves cached compound data by name or alias.
   * Checks in-memory cache first, then Redis.
   */
  async get(key: string): Promise<ScientificCompoundData | null | undefined> {
    const normKey = this.normalizeKey(key);
    if (!normKey) return undefined;

    const now = Date.now();

    // 1. In-memory L1 cache check
    const memEntry = this.memoryCache.get(normKey);
    if (memEntry) {
      if (memEntry.expiresAt > now) {
        return memEntry.data;
      }
      this.memoryCache.delete(normKey);
    }

    // 2. Redis L2 cache check
    if (this.redisClient) {
      try {
        const raw = await this.redisClient.get(this.getRedisKey(normKey));
        if (raw !== null) {
          const parsed = JSON.parse(raw) as ScientificCompoundData | null;
          // Store in L1 for faster future lookups
          const ttl = parsed === null ? this.negativeTtlMs : this.positiveTtlMs;
          this.setMemory(normKey, parsed, ttl);
          return parsed;
        }
      } catch (redisErr) {
        if (!this.redisWarned) {
          process.stderr.write(
            `[CHEMICAL_CACHE_REDIS_ERROR] Redis cache read failed, falling back to memory: ${String(redisErr)}\n`,
          );
          this.redisWarned = true;
        }
      }
    }

    return undefined; // Not in cache
  }

  /**
   * Stores compound data (or null for negative caching).
   */
  async set(key: string, data: ScientificCompoundData | null): Promise<void> {
    const normKey = this.normalizeKey(key);
    if (!normKey) return;

    const ttlMs = data === null ? this.negativeTtlMs : this.positiveTtlMs;
    const ttlSeconds = Math.ceil(ttlMs / 1000);

    // 1. Set in L1 memory
    this.setMemory(normKey, data, ttlMs);

    // 2. Set in L2 Redis
    if (this.redisClient) {
      try {
        const redisKey = this.getRedisKey(normKey);
        await this.redisClient.set(redisKey, JSON.stringify(data), "EX", ttlSeconds);
      } catch (redisErr) {
        if (!this.redisWarned) {
          process.stderr.write(
            `[CHEMICAL_CACHE_REDIS_ERROR] Redis cache write failed: ${String(redisErr)}\n`,
          );
          this.redisWarned = true;
        }
      }
    }
  }

  private setMemory(key: string, data: ScientificCompoundData | null, ttlMs: number): void {
    if (this.memoryCache.size >= this.maxMemoryEntries) {
      // Evict oldest inserted entry
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey !== undefined) {
        this.memoryCache.delete(firstKey);
      }
    }

    this.memoryCache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clears in-memory entries (useful for test suites).
   */
  clearMemory(): void {
    this.memoryCache.clear();
  }
}
