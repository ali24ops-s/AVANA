/**
 * Production-Grade Redis Health Checker.
 *
 * Provides real connectivity and latency probing for Redis via PING / PONG.
 *
 * Guarantees:
 * - Fail-fast execution with strict configurable timeout (default 2000ms).
 * - Never blocks or hangs the calling endpoint.
 * - Redacts all passwords, tokens, and connection credentials from error reasons.
 * - Prevents process crashes via isolated error handling and clean socket teardown.
 */

import { Redis } from "ioredis";

export interface RedisHealthResult {
  status: "healthy" | "unhealthy" | "disabled" | "not_configured";
  latencyMs?: number | null;
  reason?: string | null;
}

/**
 * Redact sensitive info (such as passwords in redis URLs) from error strings.
 */
function sanitizeRedisError(raw: string, redisUrl?: string): string {
  let sanitized = raw;
  if (redisUrl && redisUrl.includes("@")) {
    try {
      const parsed = new URL(redisUrl);
      if (parsed.password) {
        sanitized = sanitized.split(parsed.password).join("[REDACTED]");
      }
    } catch {
      // Ignore URL parse error
    }
  }
  return sanitized.replace(/redis:\/\/[^@\s]+@/g, "redis://[REDACTED]@");
}

/**
 * Check Redis reachability, authentication, and round-trip latency.
 */
export async function checkRedisHealth(
  redisUrl?: string,
  timeoutMs: number = 2000,
): Promise<RedisHealthResult> {
  if (!redisUrl || redisUrl.trim().length === 0) {
    return {
      status: "not_configured",
      latencyMs: null,
      reason: "Redis URL not configured",
    };
  }

  const normalized = redisUrl.trim().toLowerCase();
  if (normalized === "disabled" || normalized === "mock" || normalized === "none") {
    return {
      status: "disabled",
      latencyMs: null,
      reason: "Redis is intentionally disabled",
    };
  }

  const startTime = Date.now();
  let client: Redis | null = null;
  let timer: NodeJS.Timeout | null = null;

  try {
    const probePromise = (async (): Promise<RedisHealthResult> => {
      client = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: timeoutMs,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
        enableOfflineQueue: false,
        enableReadyCheck: false,
      });

      // Suppress unhandled error events
      client.on("error", () => {});

      await client.connect();
      const pong = await client.ping();
      const latencyMs = Date.now() - startTime;

      if (pong === "PONG") {
        return {
          status: "healthy",
          latencyMs,
        };
      }

      return {
        status: "unhealthy",
        latencyMs: null,
        reason: `Unexpected PING response: ${String(pong)}`,
      };
    })();

    const timeoutPromise = new Promise<RedisHealthResult>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Redis health check timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return await Promise.race([probePromise, timeoutPromise]);
  } catch (err: any) {
    const rawMsg = err?.message || String(err);
    const sanitized = sanitizeRedisError(rawMsg, redisUrl);

    return {
      status: "unhealthy",
      latencyMs: null,
      reason: `Connection failed: ${sanitized.slice(0, 150)}`,
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    const redisInstance = client as Redis | null;
    if (redisInstance) {
      try {
        redisInstance.disconnect();
      } catch {
        // Suppress disconnect errors
      }
    }
  }
}
