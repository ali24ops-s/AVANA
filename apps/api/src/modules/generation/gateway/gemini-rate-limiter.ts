/**
 * GeminiRateLimiter — Redis-backed distributed token bucket and sliding window rate limiter.
 *
 * Implements:
 * 1. Distributed rate limiting across API and Worker processes via atomic Redis Lua scripts.
 * 2. Sliding-window RPM (Requests Per Minute) and TPM (Tokens Per Minute) tracking.
 * 3. Daily RPD (Requests Per Day) quota tracking.
 * 4. Project-based quota isolation (multiple keys sharing a project ID share the same quota pool).
 * 5. Interactive capacity reservation (protecting high-priority user chat/mentor requests from batch exhaustion).
 * 6. Atomic capacity reservation with post-execution token adjustments and TTL cleanup.
 * 7. Fail-closed error handling when Redis is configured but unreachable.
 * 8. In-memory fallback mode for offline/isolated tests when Redis is omitted.
 */

import type { Redis } from "ioredis";
import { DomainError } from "@avana/domain";

export interface ProjectQuotaConfig {
  rpm: number;
  tpm: number;
  rpd?: number;
}

export interface GeminiRateLimiterOptions {
  redis?: Redis;
  defaultRpm?: number;
  defaultTpm?: number;
  defaultRpd?: number;
  interactiveReservedPercent?: number;
  projectQuotas?: Record<string, Partial<ProjectQuotaConfig>>;
  failClosed?: boolean;
}

export interface ReserveCapacityParams {
  projectId: string;
  slotId: string;
  model: string;
  estimatedTokens: number;
  isInteractive?: boolean;
  reservationId?: string;
  now?: number;
}

export interface ReservationResult {
  allowed: boolean;
  reservationId?: string;
  retryAfterMs?: number;
  reason?: "rpm_exceeded" | "tpm_exceeded" | "rpd_exceeded" | "project_cooldown" | "slot_cooldown" | "slot_invalid";
  remainingRpm?: number;
  remainingTpm?: number;
}

const LUA_RESERVE_CAPACITY = `
local now = tonumber(ARGV[1])
local rpmLimit = tonumber(ARGV[2])
local tpmLimit = tonumber(ARGV[3])
local rpdLimit = tonumber(ARGV[4])
local estimatedTokens = tonumber(ARGV[5])
local isInteractive = ARGV[6] == "1"
local reservedPercent = tonumber(ARGV[7])
local slotId = ARGV[8]
local projectId = ARGV[9]
local resTtl = tonumber(ARGV[10])

-- 1. Check if project is in cooldown
local projectCooldown = redis.call('GET', KEYS[5])
if projectCooldown then
  local cooldownUntil = tonumber(projectCooldown)
  if cooldownUntil and cooldownUntil > now then
    return {'ERROR', 'PROJECT_COOLDOWN', tostring(cooldownUntil - now)}
  else
    redis.call('DEL', KEYS[5])
  end
end

-- 2. Check slot health in Redis
local slotState = redis.call('HGET', KEYS[6], 'state')
local slotCooldown = redis.call('HGET', KEYS[6], 'cooldownUntil')
if slotState then
  if slotState == 'invalid' then
    return {'ERROR', 'SLOT_INVALID', '0'}
  end
  if (slotState == 'rate_limited' or slotState == 'quota_exhausted') and slotCooldown then
    local cd = tonumber(slotCooldown)
    if cd and cd > now then
      return {'ERROR', 'SLOT_COOLDOWN', tostring(cd - now)}
    else
      redis.call('HSET', KEYS[6], 'state', 'healthy', 'cooldownUntil', '0')
    end
  end
end

-- 3. Check RPD
local effRpd = rpdLimit
if not isInteractive and reservedPercent > 0 and rpdLimit > 0 then
  effRpd = math.floor(rpdLimit * (100 - reservedPercent) / 100)
end
if effRpd > 0 then
  local currentRpd = tonumber(redis.call('GET', KEYS[3]) or '0')
  if currentRpd >= effRpd then
    return {'ERROR', 'RPD_EXCEEDED', '86400000'}
  end
end

-- 4. Calculate sliding window for RPM & TPM
local curReq = tonumber(redis.call('HGET', KEYS[1], 'req') or '0')
local curTok = tonumber(redis.call('HGET', KEYS[1], 'tok') or '0')
local prevReq = tonumber(redis.call('HGET', KEYS[2], 'req') or '0')
local prevTok = tonumber(redis.call('HGET', KEYS[2], 'tok') or '0')

local minuteOffset = now % 60000
local pastWeight = (60000 - minuteOffset) / 60000
local slidingReq = curReq + (prevReq * pastWeight)
local slidingTok = curTok + (prevTok * pastWeight)

local effRpm = rpmLimit
local effTpm = tpmLimit
if not isInteractive and reservedPercent > 0 then
  effRpm = math.floor(rpmLimit * (100 - reservedPercent) / 100)
  effTpm = math.floor(tpmLimit * (100 - reservedPercent) / 100)
  if effRpm < 0 then effRpm = 0 end
  if effTpm < 0 then effTpm = 0 end
end

if (slidingReq + 1) > effRpm then
  local retryAfterMs = math.max(1000, 60000 - minuteOffset)
  return {'ERROR', 'RPM_EXCEEDED', tostring(retryAfterMs)}
end

if (slidingTok + estimatedTokens) > effTpm then
  local retryAfterMs = math.max(1000, 60000 - minuteOffset)
  return {'ERROR', 'TPM_EXCEEDED', tostring(retryAfterMs)}
end

-- 5. Record consumption and reservation atomically
redis.call('HINCRBY', KEYS[1], 'req', 1)
redis.call('HINCRBY', KEYS[1], 'tok', estimatedTokens)
redis.call('EXPIRE', KEYS[1], 120)

if rpdLimit > 0 then
  redis.call('INCRBY', KEYS[3], 1)
  redis.call('EXPIRE', KEYS[3], 172800)
end

-- Update slot lastUsedAt in Redis
redis.call('HSET', KEYS[6], 'lastUsedAt', tostring(now), 'state', 'healthy')

-- Store reservation details
redis.call('HSET', KEYS[4], 'projectId', projectId, 'slotId', slotId, 'estTok', tostring(estimatedTokens), 'minuteKey', KEYS[1])
redis.call('EXPIRE', KEYS[4], resTtl)

return {'OK', slotId, tostring(math.floor(effRpm - slidingReq - 1)), tostring(math.floor(effTpm - slidingTok - estimatedTokens))}
`;

const LUA_ADJUST_RESERVATION = `
local res = redis.call('HGETALL', KEYS[1])
if #res == 0 then
  return 0
end

local resMap = {}
for i = 1, #res, 2 do
  resMap[res[i]] = res[i+1]
end

local minuteKey = resMap['minuteKey']
local estTok = tonumber(resMap['estTok'] or '0')
local actualTok = tonumber(ARGV[1])

if minuteKey and redis.call('EXISTS', minuteKey) == 1 then
  if actualTok < 0 then
    if estTok > 0 then
      redis.call('HINCRBY', minuteKey, 'tok', -estTok)
    end
  elseif actualTok >= 0 and estTok > actualTok then
    local diff = estTok - actualTok
    redis.call('HINCRBY', minuteKey, 'tok', -diff)
  end
end

redis.call('DEL', KEYS[1])
return 1
`;

export class GeminiRateLimiter {
  private readonly redis?: Redis;
  private readonly defaultRpm: number;
  private readonly defaultTpm: number;
  private readonly defaultRpd: number;
  private readonly interactiveReservedPercent: number;
  private readonly projectQuotas: Record<string, Partial<ProjectQuotaConfig>>;
  private readonly failClosed: boolean;

  // In-memory fallback state when Redis is not provided
  private readonly memoryBuckets = new Map<string, { req: number; tok: number; expiresAt: number }>();
  private readonly memoryReservations = new Map<string, { minuteKey: string; estTok: number }>();
  private readonly memoryRpd = new Map<string, { count: number; dateStr: string }>();

  constructor(options: GeminiRateLimiterOptions = {}) {
    this.redis = options.redis;
    this.defaultRpm = options.defaultRpm ?? 15;
    this.defaultTpm = options.defaultTpm ?? 1_000_000;
    this.defaultRpd = options.defaultRpd ?? 1500;
    this.interactiveReservedPercent = options.interactiveReservedPercent ?? 10;
    this.projectQuotas = options.projectQuotas ?? {};
    this.failClosed = options.failClosed ?? true;
  }

  /**
   * Resolve effective quota for a given project.
   */
  getProjectQuota(projectId: string): ProjectQuotaConfig {
    const override = this.projectQuotas[projectId] || {};
    return {
      rpm: override.rpm ?? this.defaultRpm,
      tpm: override.tpm ?? this.defaultTpm,
      rpd: override.rpd ?? this.defaultRpd,
    };
  }

  /**
   * Attempt to atomically reserve rate limit capacity for a key slot and project.
   */
  async reserveCapacity(params: ReserveCapacityParams): Promise<ReservationResult> {
    const now = params.now ?? Date.now();
    const quota = this.getProjectQuota(params.projectId);
    const reservationId = params.reservationId ?? crypto.randomUUID();
    const resTtl = 180; // 3 minutes TTL

    if (!this.redis) {
      return this.reserveInMemory(params, quota, reservationId, now);
    }

    const curMin = Math.floor(now / 60_000);
    const prevMin = curMin - 1;
    const dateStr = new Date(now).toISOString().slice(0, 10).replace(/-/g, "");

    // Keys formatted with {projectId} hashtag for Redis cluster compatibility
    const curMinKey = `ai:gemini:{${params.projectId}}:quota:${params.model}:m:${curMin}`;
    const prevMinKey = `ai:gemini:{${params.projectId}}:quota:${params.model}:m:${prevMin}`;
    const rpdKey = `ai:gemini:{${params.projectId}}:rpd:${dateStr}`;
    const resKey = `ai:gemini:{${params.projectId}}:res:${reservationId}`;
    const projCooldownKey = `ai:gemini:{${params.projectId}}:cooldown`;
    const slotKey = `ai:gemini:{${params.projectId}}:slot:${params.slotId}`;

    try {
      const result = (await this.redis.eval(
        LUA_RESERVE_CAPACITY,
        6,
        curMinKey,
        prevMinKey,
        rpdKey,
        resKey,
        projCooldownKey,
        slotKey,
        String(now),
        String(quota.rpm),
        String(quota.tpm),
        String(quota.rpd ?? 0),
        String(params.estimatedTokens),
        params.isInteractive ? "1" : "0",
        String(this.interactiveReservedPercent),
        params.slotId,
        params.projectId,
        String(resTtl),
      )) as [string, string, string, string?];

      if (result[0] === "OK") {
        return {
          allowed: true,
          reservationId,
          remainingRpm: Number(result[2]),
          remainingTpm: Number(result[3]),
        };
      }

      const errType = result[1];
      const waitMs = Number(result[2]) || 1000;

      let reason: ReservationResult["reason"] = "rpm_exceeded";
      if (errType === "RPM_EXCEEDED") reason = "rpm_exceeded";
      else if (errType === "TPM_EXCEEDED") reason = "tpm_exceeded";
      else if (errType === "RPD_EXCEEDED") reason = "rpd_exceeded";
      else if (errType === "PROJECT_COOLDOWN") reason = "project_cooldown";
      else if (errType === "SLOT_COOLDOWN") reason = "slot_cooldown";
      else if (errType === "SLOT_INVALID") reason = "slot_invalid";

      return {
        allowed: false,
        retryAfterMs: waitMs,
        reason,
      };
    } catch (err) {
      if (this.failClosed) {
        throw new DomainError(
          "service_unavailable",
          `Redis rate limit service unavailable: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return this.reserveInMemory(params, quota, reservationId, now);
    }
  }

  /**
   * Adjust reserved tokens based on actual usage, or release entirely if actualTokens is -1.
   */
  async adjustOrReleaseReservation(
    projectId: string,
    reservationId: string,
    actualTokens?: number,
  ): Promise<void> {
    if (!reservationId) return;

    if (!this.redis) {
      this.adjustInMemory(reservationId, actualTokens);
      return;
    }

    const resKey = `ai:gemini:{${projectId}}:res:${reservationId}`;
    const actualTokensArg = actualTokens !== undefined ? String(actualTokens) : "-1";

    try {
      await this.redis.eval(LUA_ADJUST_RESERVATION, 1, resKey, actualTokensArg);
    } catch {
      // Background adjustment errors are non-blocking on client response
    }
  }

  /**
   * Set cooldown or health state for a slot and/or project.
   */
  async reportSlotState(params: {
    projectId: string;
    slotId: string;
    state: "healthy" | "rate_limited" | "quota_exhausted" | "invalid";
    cooldownMs?: number;
    now?: number;
  }): Promise<void> {
    if (!this.redis) return;

    const now = params.now ?? Date.now();
    const slotKey = `ai:gemini:{${params.projectId}}:slot:${params.slotId}`;
    const projCooldownKey = `ai:gemini:{${params.projectId}}:cooldown`;

    try {
      if (params.state === "healthy") {
        await this.redis.hset(slotKey, "state", "healthy", "cooldownUntil", "0");
      } else if (params.state === "invalid") {
        await this.redis.hset(slotKey, "state", "invalid", "cooldownUntil", "0");
      } else if (params.state === "rate_limited") {
        const cooldownUntil = now + (params.cooldownMs ?? 30_000);
        await this.redis.hset(slotKey, "state", "rate_limited", "cooldownUntil", String(cooldownUntil));
      } else if (params.state === "quota_exhausted") {
        const cooldownMs = params.cooldownMs ?? 24 * 60 * 60 * 1000;
        const cooldownUntil = now + cooldownMs;
        await this.redis.hset(slotKey, "state", "quota_exhausted", "cooldownUntil", String(cooldownUntil));
        // Project-wide quota exhaustion
        await this.redis.set(projCooldownKey, String(cooldownUntil), "PX", cooldownMs);
      }
    } catch (err) {
      if (this.failClosed) {
        throw new DomainError(
          "service_unavailable",
          `Redis error updating key slot state: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Check if rate limiter is connected to distributed Redis.
   */
  isDistributed(): boolean {
    return Boolean(this.redis);
  }

  /**
   * Fetch current slot state from Redis.
   */
  async getSlotState(
    projectId: string,
    slotId: string,
  ): Promise<{ state: string; cooldownUntil: number; lastUsedAt: number | null } | null> {
    if (!this.redis) return null;
    try {
      const slotKey = `ai:gemini:{${projectId}}:slot:${slotId}`;
      const res = await this.redis.hgetall(slotKey);
      if (!res || !res.state) return null;
      return {
        state: res.state,
        cooldownUntil: res.cooldownUntil ? parseInt(res.cooldownUntil, 10) : 0,
        lastUsedAt: res.lastUsedAt ? parseInt(res.lastUsedAt, 10) : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * In-memory reservation logic for offline tests.
   */
  private reserveInMemory(
    params: ReserveCapacityParams,
    quota: ProjectQuotaConfig,
    reservationId: string,
    now: number,
  ): ReservationResult {
    const curMin = Math.floor(now / 60_000);
    const minuteOffset = now % 60_000;
    const pastWeight = (60_000 - minuteOffset) / 60_000;

    const curKey = `${params.projectId}:${params.model}:${curMin}`;
    const prevKey = `${params.projectId}:${params.model}:${curMin - 1}`;

    const cur = this.memoryBuckets.get(curKey) || { req: 0, tok: 0, expiresAt: now + 120_000 };
    const prev = this.memoryBuckets.get(prevKey) || { req: 0, tok: 0, expiresAt: 0 };

    const slidingReq = cur.req + prev.req * pastWeight;
    const slidingTok = cur.tok + prev.tok * pastWeight;

    let effRpm = quota.rpm;
    let effTpm = quota.tpm;
    let effRpd = quota.rpd ?? 0;

    if (!params.isInteractive && this.interactiveReservedPercent > 0) {
      effRpm = Math.floor((quota.rpm * (100 - this.interactiveReservedPercent)) / 100);
      effTpm = Math.floor((quota.tpm * (100 - this.interactiveReservedPercent)) / 100);
      if (quota.rpd && quota.rpd > 0) {
        effRpd = Math.floor((quota.rpd * (100 - this.interactiveReservedPercent)) / 100);
      }
      if (effRpm < 0) effRpm = 0;
      if (effTpm < 0) effTpm = 0;
    }

    if (slidingReq + 1 > effRpm) {
      return {
        allowed: false,
        retryAfterMs: Math.max(1000, 60_000 - minuteOffset),
        reason: "rpm_exceeded",
      };
    }

    if (slidingTok + params.estimatedTokens > effTpm) {
      return {
        allowed: false,
        retryAfterMs: Math.max(1000, 60_000 - minuteOffset),
        reason: "tpm_exceeded",
      };
    }

    // Daily check
    const dateStr = new Date(now).toISOString().slice(0, 10);
    const rpdRecord = this.memoryRpd.get(params.projectId) || { count: 0, dateStr };
    if (rpdRecord.dateStr !== dateStr) {
      rpdRecord.count = 0;
      rpdRecord.dateStr = dateStr;
    }
    if (effRpd > 0 && rpdRecord.count >= effRpd) {
      return {
        allowed: false,
        retryAfterMs: 86_400_000,
        reason: "rpd_exceeded",
      };
    }

    rpdRecord.count += 1;
    this.memoryRpd.set(params.projectId, rpdRecord);

    cur.req += 1;
    cur.tok += params.estimatedTokens;
    this.memoryBuckets.set(curKey, cur);

    this.memoryReservations.set(reservationId, {
      minuteKey: curKey,
      estTok: params.estimatedTokens,
    });

    return {
      allowed: true,
      reservationId,
      remainingRpm: Math.floor(effRpm - slidingReq - 1),
      remainingTpm: Math.floor(effTpm - slidingTok - params.estimatedTokens),
    };
  }

  /**
   * In-memory adjustment logic for offline tests.
   */
  private adjustInMemory(reservationId: string, actualTokens?: number): void {
    const res = this.memoryReservations.get(reservationId);
    if (!res) return;

    this.memoryReservations.delete(reservationId);
    const bucket = this.memoryBuckets.get(res.minuteKey);
    if (!bucket) return;

    if (actualTokens === undefined || actualTokens < 0) {
      bucket.tok = Math.max(0, bucket.tok - res.estTok);
    } else if (res.estTok > actualTokens) {
      bucket.tok = Math.max(0, bucket.tok - (res.estTok - actualTokens));
    }
  }
}
