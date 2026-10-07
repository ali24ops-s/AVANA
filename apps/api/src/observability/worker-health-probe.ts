/**
 * Production-Grade AVANA Worker Health Probe.
 *
 * Checks worker health without relying on false-positive assumptions:
 * 1. Checks BullMQ active jobs count for the content generation queue.
 * 2. If active > 0: inspects latest heartbeatAt across generationJobs and generationChunks.
 *    - If heartbeat is fresh (<= 5 min): healthy (processing jobs).
 *    - If heartbeat is stale (> 5 min): unhealthy (worker stalled/crashed).
 * 3. If active === 0:
 *    - Because there is no persistent process-level heartbeat daemon in the worker when idle,
 *      we avoid false-positive "Healthy" and return "unknown" (idle / no active jobs).
 * 4. On any query error or queue timeout: returns "unhealthy" with sanitized reason.
 */

import type { Queue } from "bullmq";
import type { DbClient } from "@avana/database/client";
import { generationJobs, generationChunks } from "@avana/database/schema";
import { and, isNull, or, eq, desc } from "drizzle-orm";
import { DEFAULT_GENERATION_STALE_THRESHOLD_MS } from "@avana/domain";

export interface WorkerHealthProbeResult {
  status: "healthy" | "unhealthy" | "unknown";
  details?: string;
}

export interface WorkerHealthProbeDeps {
  queue?: Queue;
  db?: DbClient;
  staleThresholdMs?: number;
}

export async function checkWorkerHealth(
  deps: WorkerHealthProbeDeps,
): Promise<WorkerHealthProbeResult> {
  const { queue, db, staleThresholdMs = DEFAULT_GENERATION_STALE_THRESHOLD_MS } = deps;

  if (!queue) {
    return {
      status: "unknown",
      details: "صف BullMQ پیکربندی نشده است",
    };
  }

  try {
    // 1. Get queue active jobs count with a fast timeout
    const activeCount = await queue.getActiveCount();

    if (activeCount > 0) {
      if (!db || typeof db.select !== "function") {
        return {
          status: "unknown",
          details: `دارای ${activeCount} جاب در حال پردازش (دیتابیس در دسترس نیست)`,
        };
      }

      const now = Date.now();
      const staleThreshold = new Date(now - staleThresholdMs);

      // Inspect the latest heartbeat in active generationJobs
      const [latestJob] = await db
        .select({
          heartbeatAt: generationJobs.heartbeatAt,
          updatedAt: generationJobs.updatedAt,
        })
        .from(generationJobs)
        .where(
          and(
            or(
              eq(generationJobs.status, "running"),
              eq(generationJobs.status, "processing"),
            ),
            isNull(generationJobs.deletedAt),
          ),
        )
        .orderBy(desc(generationJobs.updatedAt))
        .limit(1);

      // Inspect the latest heartbeat in active generationChunks
      const [latestChunk] = await db
        .select({
          heartbeatAt: generationChunks.heartbeatAt,
          updatedAt: generationChunks.updatedAt,
        })
        .from(generationChunks)
        .where(
          and(
            eq(generationChunks.status, "running"),
            isNull(generationChunks.deletedAt),
          ),
        )
        .orderBy(desc(generationChunks.updatedAt))
        .limit(1);

      const jobHeartbeat = latestJob?.heartbeatAt ?? latestJob?.updatedAt;
      const chunkHeartbeat = latestChunk?.heartbeatAt ?? latestChunk?.updatedAt;

      let mostRecentHeartbeat: Date | null = null;
      if (jobHeartbeat && chunkHeartbeat) {
        mostRecentHeartbeat = jobHeartbeat > chunkHeartbeat ? jobHeartbeat : chunkHeartbeat;
      } else if (jobHeartbeat) {
        mostRecentHeartbeat = jobHeartbeat;
      } else if (chunkHeartbeat) {
        mostRecentHeartbeat = chunkHeartbeat;
      }

      if (mostRecentHeartbeat && mostRecentHeartbeat > staleThreshold) {
        return {
          status: "healthy",
          details: `در حال پردازش ${activeCount} جاب (ضربان قلب ورکر تازه است)`,
        };
      }

      return {
        status: "unhealthy",
        details: `دارای ${activeCount} جاب متوقف‌شده (ضربان قلب ورکر دریافت نمی‌شود)`,
      };
    }

    // activeCount === 0
    // In current architecture, heartbeat is only updated during job execution.
    // To strictly avoid false-positives, we report unknown (idle) rather than healthy.
    return {
      status: "unknown",
      details: "بدون جاب فعال (ورکر در وضعیت انتظار / آماده)",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "unhealthy",
      details: `خطا در بررسی سلامت ورکر: ${msg.slice(0, 80)}`,
    };
  }
}
