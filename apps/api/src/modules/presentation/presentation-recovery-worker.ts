/**
 * Presentation Recovery Worker.
 *
 * Runs an autonomous background cycle to inspect and recover stale presentation
 * generation operations (> 5 minutes) without requiring client HTTP traffic.
 *
 * Guarantees:
 * 1. Immediate first execution on startup.
 * 2. Periodic execution (default: every 60 seconds).
 * 3. In-process single-flight protection (prevents overlapping cycles).
 * 4. Multi-instance coordination via PostgreSQL atomic lease locks (claimStaleOperation).
 * 5. Isolated error handling: transient errors are logged with structured logger and do not kill the worker.
 * 6. Graceful shutdown: awaits active processing cycle and cancels scheduled timers.
 */

import { randomUUID } from "node:crypto";
import type { PresentationGenerationOperationService } from "./presentation-generation-operation-service.js";

export interface PresentationRecoveryLogger {
  info(obj: Record<string, unknown> | string, msg?: string): void;
  warn(obj: Record<string, unknown> | string, msg?: string): void;
  error(obj: Record<string, unknown> | string, msg?: string): void;
  debug?(obj: Record<string, unknown> | string, msg?: string): void;
}

const defaultLogger: PresentationRecoveryLogger = {
  info: (obj, msg) => {
    process.stdout.write(
      JSON.stringify({
        level: "info",
        tag: "presentation-recovery",
        msg: typeof msg === "string" ? msg : undefined,
        ...(typeof obj === "object" && obj !== null ? obj : { data: obj }),
      }) + "\n",
    );
  },
  warn: (obj, msg) => {
    process.stdout.write(
      JSON.stringify({
        level: "warn",
        tag: "presentation-recovery",
        msg: typeof msg === "string" ? msg : undefined,
        ...(typeof obj === "object" && obj !== null ? obj : { data: obj }),
      }) + "\n",
    );
  },
  error: (obj, msg) => {
    process.stderr.write(
      JSON.stringify({
        level: "error",
        tag: "presentation-recovery",
        msg: typeof msg === "string" ? msg : undefined,
        ...(typeof obj === "object" && obj !== null ? obj : { data: obj }),
      }) + "\n",
    );
  },
};

export interface PresentationRecoveryWorkerOptions {
  operationService: PresentationGenerationOperationService;
  logger?: PresentationRecoveryLogger;
  pollIntervalMs?: number; // default: 60_000 (60s)
  staleThresholdMs?: number; // default: 5 * 60 * 1000 (5 mins)
  workerId?: string;
}

export class PresentationRecoveryWorker {
  private readonly operationService: PresentationGenerationOperationService;
  private readonly logger: PresentationRecoveryLogger;
  private readonly pollIntervalMs: number;
  private readonly staleThresholdMs: number;
  private readonly workerId: string;

  private isRunning = false;
  private isStopping = false;
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;
  private activeProcessingPromise: Promise<void> | null = null;

  constructor(options: PresentationRecoveryWorkerOptions) {
    this.operationService = options.operationService;
    this.logger = options.logger ?? defaultLogger;
    this.pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 60_000);
    this.staleThresholdMs = Math.max(100, options.staleThresholdMs ?? 5 * 60 * 1000);
    this.workerId =
      options.workerId ??
      `recovery_worker_${process.pid}_${randomUUID().slice(0, 8)}`;
  }

  public getStatus(): {
    isRunning: boolean;
    isStopping: boolean;
    isProcessing: boolean;
    workerId: string;
  } {
    return {
      isRunning: this.isRunning,
      isStopping: this.isStopping,
      isProcessing: this.isProcessing,
      workerId: this.workerId,
    };
  }

  /**
   * Start the background recovery worker:
   * 1. Runs an immediate first pass.
   * 2. Schedules periodic ticks every pollIntervalMs.
   */
  public start(): void {
    if (this.isRunning || this.isStopping) {
      return;
    }
    this.isRunning = true;
    this.isStopping = false;

    this.logger.info(
      {
        workerId: this.workerId,
        pollIntervalMs: this.pollIntervalMs,
        staleThresholdMs: this.staleThresholdMs,
      },
      "Starting presentation recovery worker with immediate first pass",
    );

    // Immediate first pass on boot (non-blocking to caller)
    void this.executeCycle().finally(() => {
      if (this.isRunning && !this.isStopping) {
        this.scheduleNextTick();
      }
    });
  }

  private scheduleNextTick(): void {
    if (!this.isRunning || this.isStopping) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.isRunning || this.isStopping) {
        return;
      }
      void this.executeCycle().finally(() => {
        if (this.isRunning && !this.isStopping) {
          this.scheduleNextTick();
        }
      });
    }, this.pollIntervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Manually trigger a recovery cycle immediately (e.g. for testing or explicit sync).
   */
  public async trigger(): Promise<void> {
    if (this.isStopping) {
      return;
    }
    await this.executeCycle();
  }

  /**
   * Executes a single recovery cycle with single-flight locking and error isolation.
   */
  public async executeCycle(): Promise<void> {
    if (this.isStopping || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const runPromise = (async () => {
      try {
        const stats = await this.operationService.recoverStaleOperations(
          this.staleThresholdMs,
          this.workerId,
        );

        if (stats.examined > 0) {
          this.logger.info(
            { workerId: this.workerId, stats },
            "Completed recovery cycle for stale presentation operations",
          );
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(
          {
            workerId: this.workerId,
            error: errorMessage,
            stack: err instanceof Error ? err.stack : undefined,
          },
          "Error occurred during presentation recovery cycle; will retry on next interval",
        );
      } finally {
        this.isProcessing = false;
        this.activeProcessingPromise = null;
      }
    })();

    this.activeProcessingPromise = runPromise;
    await runPromise;
  }

  /**
   * Gracefully stop the worker: cancels timers and awaits in-flight cycle.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning && !this.isProcessing) {
      return;
    }

    this.logger.info(
      { workerId: this.workerId },
      "Stopping presentation recovery worker gracefully",
    );
    this.isStopping = true;
    this.isRunning = false;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.activeProcessingPromise) {
      try {
        await this.activeProcessingPromise;
      } catch {
        // Suppress error during shutdown wait
      }
    }

    this.isStopping = false;
    this.logger.info(
      { workerId: this.workerId },
      "Presentation recovery worker stopped cleanly",
    );
  }
}
