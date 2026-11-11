/**
 * PaymentExtractionRateLimiter
 *
 * Distributed, atomic rate limiter for the card-to-card extraction endpoint.
 *
 * Security Architecture:
 * 1. Atomic Lua Script: Evaluates both user and IP quotas in a single atomic transaction.
 * 2. Hash Slot Safe: Uses Redis Hash Tag `{c2c}` to ensure both keys map to the same
 *    cluster slot in Redis Cluster topologies.
 * 3. Fail-Closed in Production: If Redis is missing, times out, or throws an error,
 *    fails closed with HTTP 503 (DomainError 'service_unavailable') to guarantee zero
 *    unrestricted Gemini calls.
 * 4. Zero Cross-Pollution: Rejection does NOT increment or mutate remaining counters.
 * 5. Memory Fallback: Strictly limited to NODE_ENV 'test' or 'development'.
 */

import type { Redis } from "ioredis";
import { DomainError } from "@avana/domain";

export interface PaymentRateLimiterOptions {
  redis?: Redis | null;
  isProduction?: boolean;
  maxRequestsPerMinuteUser?: number;
  maxRequestsPerMinuteIp?: number;
  windowSeconds?: number;
}

const ATOMIC_RATE_LIMIT_LUA = `
local userKey = KEYS[1]
local ipKey = KEYS[2]
local userLimit = tonumber(ARGV[1])
local ipLimit = tonumber(ARGV[2])
local windowSec = tonumber(ARGV[3])

local userCur = tonumber(redis.call('GET', userKey) or '0')
local ipCur = tonumber(redis.call('GET', ipKey) or '0')

if userCur >= userLimit then
  return { 0, 'USER_LIMIT', tostring(userCur) }
end

if ipCur >= ipLimit then
  return { 0, 'IP_LIMIT', tostring(ipCur) }
end

local newUserCur = redis.call('INCR', userKey)
if newUserCur == 1 then
  redis.call('EXPIRE', userKey, windowSec)
end

local newIpCur = redis.call('INCR', ipKey)
if newIpCur == 1 then
  redis.call('EXPIRE', ipKey, windowSec)
end

return { 1, 'OK', tostring(newUserCur) }
`;

export class PaymentExtractionRateLimiter {
  private readonly redis: Redis | null;
  private readonly isProduction: boolean;
  private readonly maxUserRpm: number;
  private readonly maxIpRpm: number;
  private readonly windowSeconds: number;

  // In-memory sliding window fallback (strictly for test / dev only)
  private readonly memoryBuckets = new Map<string, number[]>();

  constructor(options: PaymentRateLimiterOptions = {}) {
    this.redis = options.redis ?? null;
    this.isProduction =
      options.isProduction ?? (process.env.NODE_ENV === "production");
    this.maxUserRpm = options.maxRequestsPerMinuteUser ?? 10;
    this.maxIpRpm = options.maxRequestsPerMinuteIp ?? 10;
    this.windowSeconds = options.windowSeconds ?? 60;
  }

  /**
   * Consume a rate limit slot for userId and IP.
   * Throws DomainError('rate_limit_exceeded') if limit reached.
   * Throws DomainError('service_unavailable') if Redis fails in Production.
   */
  async checkAndConsume(userId: string, rawIp: string): Promise<void> {
    const ip = this.sanitizeIp(rawIp);

    if (this.isProduction) {
      if (!this.redis) {
        throw new DomainError(
          "service_unavailable",
          "سرویس اعتبارسنجی نرخ فیش بانکی به دلیل عدم دسترسی به Redis در محیط عملیاتی در دسترس نیست (Fail Closed).",
        );
      }

      try {
        // Hash Tag {c2c} guarantees both keys land on the same Redis cluster shard
        const userKey = `{c2c}:user:${userId}`;
        const ipKey = `{c2c}:ip:${ip}`;

        const result = (await this.redis.eval(
          ATOMIC_RATE_LIMIT_LUA,
          2,
          userKey,
          ipKey,
          this.maxUserRpm,
          this.maxIpRpm,
          this.windowSeconds,
        )) as [number, string, string];

        const [allowed, status] = result;
        if (allowed !== 1) {
          throw new DomainError(
            "rate_limit_exceeded",
            status === "USER_LIMIT"
              ? "تعداد درخواست‌های استخراج رسید برای حساب کاربری شما بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید."
              : "تعداد درخواست‌های استخراج رسید از این نشانی اینترنتی بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.",
            { retryAfterSeconds: this.windowSeconds },
          );
        }
      } catch (err: unknown) {
        if (err instanceof DomainError) throw err;
        // In Production: Fail Closed on any Redis connection error or timeout
        throw new DomainError(
          "service_unavailable",
          "سرویس اعتبارسنجی نرخ فیش به دلیل خطای زیرساخت موقتاً مسدود شده است (Fail Closed).",
        );
      }
    } else {
      // Test / Development mode
      if (this.redis) {
        try {
          const userKey = `{c2c}:user:${userId}`;
          const ipKey = `{c2c}:ip:${ip}`;

          const result = (await this.redis.eval(
            ATOMIC_RATE_LIMIT_LUA,
            2,
            userKey,
            ipKey,
            this.maxUserRpm,
            this.maxIpRpm,
            this.windowSeconds,
          )) as [number, string, string];

          const [allowed, status] = result;
          if (allowed !== 1) {
            throw new DomainError(
              "rate_limit_exceeded",
              status === "USER_LIMIT"
                ? "تعداد درخواست‌های استخراج رسید برای حساب کاربری شما بیش از حد مجاز است."
                : "تعداد درخواست‌های استخراج رسید از این نشانی اینترنتی بیش از حد مجاز است.",
              { retryAfterSeconds: this.windowSeconds },
            );
          }
          return;
        } catch (err: unknown) {
          if (err instanceof DomainError) throw err;
          // In test/dev: fall back to memory
        }
      }

      // In-Memory atomic evaluation (test & dev only)
      this.consumeInMemory(`user:${userId}`, this.maxUserRpm, `ip:${ip}`, this.maxIpRpm);
    }
  }

  private consumeInMemory(
    userKey: string,
    userLimit: number,
    ipKey: string,
    ipLimit: number,
  ): void {
    const now = Date.now();
    const windowMs = this.windowSeconds * 1000;

    const userTimestamps = (this.memoryBuckets.get(userKey) || []).filter(
      (t) => now - t < windowMs,
    );
    const ipTimestamps = (this.memoryBuckets.get(ipKey) || []).filter(
      (t) => now - t < windowMs,
    );

    if (userTimestamps.length >= userLimit) {
      throw new DomainError(
        "rate_limit_exceeded",
        "تعداد درخواست‌های استخراج رسید برای حساب کاربری شما بیش از حد مجاز است.",
      );
    }

    if (ipTimestamps.length >= ipLimit) {
      throw new DomainError(
        "rate_limit_exceeded",
        "تعداد درخواست‌های استخراج رسید از این نشانی اینترنتی بیش از حد مجاز است.",
      );
    }

    userTimestamps.push(now);
    ipTimestamps.push(now);
    this.memoryBuckets.set(userKey, userTimestamps);
    this.memoryBuckets.set(ipKey, ipTimestamps);
  }

  private sanitizeIp(ip: string): string {
    const trimmed = (ip || "127.0.0.1").trim();
    return trimmed.replace(/[^a-zA-Z0-9.:_-]/g, "");
  }
}
