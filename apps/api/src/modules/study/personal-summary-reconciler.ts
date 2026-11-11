/**
 * Autonomous Personal Summary Reconciler.
 *
 * Provides background, scheduled reconciliation of stale leases and pending refunds
 * for AI-powered personal summaries without requiring user requests or HTTP traffic.
 *
 * Guarantees:
 * - Autonomous: Runs on Startup + every 2 minutes automatically.
 * - Concurrency Safe: Uses atomic DB batch claiming (`FOR UPDATE SKIP LOCKED`).
 * - Idempotent: Never double-refunds thanks to `refund_ps_${record.id}` & DB row locks.
 * - Non-overlapping: Prevents tick overlapping if a cycle takes longer than interval.
 * - Resilient: Errors in one cycle do NOT crash future cycles.
 * - Privacy-Safe: Structured operational logs strictly exclude highlights, notes, and user PII.
 * - Clean Shutdown: Immediately clears interval upon graceful shutdown.
 */

import { randomUUID } from "node:crypto";
import type {
  PersonalSummaryService,
  PersonalSummaryRecoveryCycleStats,
} from "./personal-summary-service.js";

export interface PersonalSummaryReconcilerOptions {
  /**
   * Interval between reconciliation sweeps in milliseconds.
   * Defaults to 120,000ms (2 minutes).
   */
  intervalMs?: number;

  /**
   * Unique identifier for this API instance / worker.
   */
  workerId?: string;

  /**
   * Structured operational logger (PII-free).
   */
  logger?: (msg: string) => void;

  /**
   * Warning threshold for long-running shutdown in milliseconds.
   * Defaults to 5000ms.
   */
  shutdownWarningTimeoutMs?: number;
}

export interface PersonalSummaryReconcilerHandle {
  stop: () => Promise<void>;
  isRunning: () => boolean;
  runOnce: () => Promise<PersonalSummaryRecoveryCycleStats>;
}

export function formatRecoveryCycleLog(
  stats: PersonalSummaryRecoveryCycleStats,
  workerId: string,
): string {
  return (
    `[personal-summary-recovery] cycle completed: ` +
    `worker=${workerId} ` +
    `duration=${stats.durationMs}ms ` +
    `examined=${stats.recordsExamined} ` +
    `recovered=${stats.recordsRecovered} ` +
    `refunds_ok=${stats.refundsSuccessful} ` +
    `refunds_failed=${stats.refundsFailed} ` +
    `errors=${stats.unexpectedErrors}`
  );
}

/**
 * Starts the autonomous recovery background scheduler.
 */
export function startPersonalSummaryReconciler(
  service: PersonalSummaryService,
  options: PersonalSummaryReconcilerOptions = {},
): PersonalSummaryReconcilerHandle {
  const intervalMs = options.intervalMs ?? 120_000;
  const workerId = options.workerId ?? `reconciler-${randomUUID().slice(0, 8)}`;
  const logger = options.logger ?? ((msg: string) => {
    if (process.env.NODE_ENV !== "test") {
      process.stdout.write(`${msg}\n`);
    }
  });

  let active = true;
  let timer: NodeJS.Timeout | undefined;
  let inFlightPromise: Promise<PersonalSummaryRecoveryCycleStats> | null = null;
  let stopPromise: Promise<void> | null = null;

  const runCycle = async (): Promise<PersonalSummaryRecoveryCycleStats> => {
    if (!active) {
      const now = new Date().toISOString();
      return {
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        recordsExamined: 0,
        recordsRecovered: 0,
        refundsSuccessful: 0,
        refundsFailed: 0,
        unexpectedErrors: 0,
      };
    }

    if (inFlightPromise) {
      logger(`[personal-summary-recovery] cycle skipped: previous cycle still in flight for worker ${workerId}`);
      const now = new Date().toISOString();
      return {
        startedAt: now,
        completedAt: now,
        durationMs: 0,
        recordsExamined: 0,
        recordsRecovered: 0,
        refundsSuccessful: 0,
        refundsFailed: 0,
        unexpectedErrors: 0,
      };
    }

    const executeCycle = async (): Promise<PersonalSummaryRecoveryCycleStats> => {
      try {
        const stats = await service.claimAndRecoverBatch(workerId, 50);
        if (stats.recordsExamined > 0 || stats.unexpectedErrors > 0) {
          logger(formatRecoveryCycleLog(stats, workerId));
        }
        return stats;
      } catch (cycleErr) {
        const msg = cycleErr instanceof Error ? cycleErr.message : String(cycleErr);
        logger(`[personal-summary-recovery] unexpected cycle error for worker ${workerId}: ${msg}`);
        const now = new Date().toISOString();
        return {
          startedAt: now,
          completedAt: now,
          durationMs: 0,
          recordsExamined: 0,
          recordsRecovered: 0,
          refundsSuccessful: 0,
          refundsFailed: 0,
          unexpectedErrors: 1,
        };
      } finally {
        inFlightPromise = null;
      }
    };

    inFlightPromise = executeCycle();
    return inFlightPromise;
  };

  // 1. Startup execution: fire immediately in background without blocking server boot
  void runCycle();

  // 2. Periodic execution: every 2 minutes
  timer = setInterval(() => {
    void runCycle();
  }, intervalMs);
  timer.unref?.();

  return {
    stop: (): Promise<void> => {
      if (stopPromise) {
        return stopPromise;
      }

      stopPromise = (async () => {
        // 1. Immediately deactivate so no new cycle can ever be triggered
        active = false;

        // 2. Clear timer interval
        if (timer) {
          clearInterval(timer);
          timer = undefined;
        }

        // 3. If a recovery cycle is currently in flight, await its completion
        if (inFlightPromise) {
          const warningTimeoutMs = options.shutdownWarningTimeoutMs ?? 5000;
          let warningTimer: NodeJS.Timeout | undefined;

          const warningTrigger = new Promise<void>((resolve) => {
            warningTimer = setTimeout(() => {
              logger(
                `[personal-summary-recovery] shutdown taking longer than ${warningTimeoutMs}ms, ` +
                `waiting for in-flight recovery cycle to safely complete before closing resources...`,
              );
              resolve();
            }, warningTimeoutMs);
            warningTimer.unref?.();
          });

          // Void unused warningTrigger promise catch/handling
          void warningTrigger;

          try {
            await inFlightPromise;
          } finally {
            if (warningTimer) {
              clearTimeout(warningTimer);
            }
          }
        }
      })();

      return stopPromise;
    },
    isRunning: () => active,
    runOnce: runCycle,
  };
}
