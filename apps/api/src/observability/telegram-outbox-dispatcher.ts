import { randomUUID } from "node:crypto";
import type { TelegramClient } from "./telegram-client.js";
import type {
  TelegramOutboxStore,
  TelegramOutboxRecord,
} from "./telegram-outbox-store.js";

export interface TelegramOutboxDispatcherOptions {
  store: TelegramOutboxStore;
  telegramClient: TelegramClient;
  batchSize?: number;
  pollIntervalMs?: number;
  leaseDurationSeconds?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  logger?: (msg: string) => void;
}

export function isCriticalOutboxCategory(category: string): boolean {
  return (
    category.startsWith("payment.") ||
    category.startsWith("wallet.") ||
    category.startsWith("alert.") ||
    category.startsWith("security.") ||
    category === "teacher.requested"
  );
}

export class TelegramOutboxDispatcher {
  private readonly store: TelegramOutboxStore;
  private readonly telegramClient: TelegramClient;
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly leaseDurationSeconds: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly logger: (msg: string) => void;

  private isRunning = false;
  private isStopping = false;
  private loopPromise: Promise<void> | null = null;
  private wakeUpResolver: (() => void) | null = null;
  private activeProcessingPromise: Promise<number> | null = null;

  // Global rate limit coordination (e.g. across batch items if 429 encountered)
  private rateLimitResetAt: number = 0;

  constructor(options: TelegramOutboxDispatcherOptions) {
    this.store = options.store;
    this.telegramClient = options.telegramClient;
    this.batchSize = Math.max(1, options.batchSize ?? 10);
    this.pollIntervalMs = Math.max(100, options.pollIntervalMs ?? 3000);
    this.leaseDurationSeconds = Math.max(5, options.leaseDurationSeconds ?? 30);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 10);
    this.baseDelayMs = Math.max(500, options.baseDelayMs ?? 2000);
    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs ?? 600_000); // 10 mins
    this.logger = options.logger ?? (() => {});
  }

  /**
   * Start background dispatch loop.
   */
  start(): void {
    if (this.isRunning || this.isStopping) {
      return;
    }
    this.isRunning = true;
    this.isStopping = false;
    this.loopPromise = this.runLoop();
    this.logger("[telegram-outbox] Dispatcher started");
  }

  /**
   * Trigger immediate poll (e.g. after a new message is enqueued) instead of waiting for timer.
   */
  trigger(): void {
    if (!this.isRunning || this.isStopping) return;
    if (this.wakeUpResolver) {
      this.wakeUpResolver();
      this.wakeUpResolver = null;
    }
  }

  /**
   * Stop background dispatch gracefully.
   * Cancels sleep timer, waits for current batch to complete, does not process further batches.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isStopping = true;
    this.isRunning = false;

    // Wake up sleeping loop so it exits promptly
    if (this.wakeUpResolver) {
      this.wakeUpResolver();
      this.wakeUpResolver = null;
    }

    if (this.activeProcessingPromise) {
      try {
        await this.activeProcessingPromise;
      } catch {
        // ignore
      }
    }

    if (this.loopPromise) {
      try {
        await this.loopPromise;
      } catch {
        // ignore
      }
      this.loopPromise = null;
    }

    this.isStopping = false;
    this.logger("[telegram-outbox] Dispatcher stopped gracefully");
  }

  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Continuous dispatch loop.
   */
  private async runLoop(): Promise<void> {
    while (this.isRunning && !this.isStopping) {
      try {
        // Recover expired leases first
        await this.store.recoverExpiredLeases().catch((err: unknown) => {
          this.logger(`[telegram-outbox] Error recovering expired leases: ${String(err)}`);
        });

        // If currently rate limited (429), sleep until reset
        const now = Date.now();
        if (this.rateLimitResetAt > now) {
          const sleepMs = Math.min(this.rateLimitResetAt - now, 30_000);
          await this.sleep(sleepMs);
          continue;
        }

        // Process a batch
        const processedCount = await this.processNextBatch();

        // If we processed a full batch, poll again immediately to drain queue faster
        if (processedCount >= this.batchSize && this.isRunning && !this.isStopping) {
          continue;
        }
      } catch (err: unknown) {
        this.logger(`[telegram-outbox] Unexpected error in dispatch loop: ${String(err)}`);
      }

      if (this.isRunning && !this.isStopping) {
        await this.sleep(this.pollIntervalMs);
      }
    }
  }

  /**
   * Atomically claim and process one batch of outbox messages.
   * Returns number of claimed messages.
   */
  async processNextBatch(): Promise<number> {
    if (this.isStopping) return 0;

    const leaseToken = `lease_${randomUUID().replace(/-/g, "")}`;
    let batch: readonly TelegramOutboxRecord[] = [];

    try {
      batch = await this.store.claimBatch(
        this.batchSize,
        this.leaseDurationSeconds,
        leaseToken,
      );
    } catch (err: unknown) {
      this.logger(`[telegram-outbox] Failed to claim batch from store: ${String(err)}`);
      return 0;
    }

    if (batch.length === 0) {
      return 0;
    }

    this.activeProcessingPromise = (async () => {
      for (const record of batch) {
        if (this.isStopping) {
          // Revert or let lease expire if dispatcher was told to stop
          break;
        }

        // Check global rate limit
        const now = Date.now();
        if (this.rateLimitResetAt > now) {
          const waitSeconds = Math.ceil((this.rateLimitResetAt - now) / 1000);
          await this.store.scheduleRetry(
            record.id,
            leaseToken,
            new Date(this.rateLimitResetAt),
            `telegram_rate_limited: waiting ${waitSeconds}s`,
          );
          continue;
        }

        await this.processSingleRecord(record, leaseToken);
      }
      return batch.length;
    })();

    try {
      return await this.activeProcessingPromise;
    } finally {
      this.activeProcessingPromise = null;
    }
  }

  /**
   * Process a single claimed record.
   */
  private async processSingleRecord(
    record: TelegramOutboxRecord,
    leaseToken: string,
  ): Promise<void> {
    try {
      const result = await this.telegramClient.sendMessage(
        record.payload.text,
        record.chatId,
        record.payload.replyMarkup,
      );

      if (result.sent) {
        const marked = await this.store.markSent(record.id, leaseToken);
        if (!marked) {
          this.logger(
            `[telegram-outbox] Sent message ${record.id} but lease ownership was lost (stale).`,
          );
        }
        return;
      }

      // Handle delivery failure
      const errorMsg = result.reason || "delivery_failed";

      // 1. Rate Limit (HTTP 429)
      if (result.statusCode === 429 || result.retryAfterSeconds !== undefined) {
        const retryAfterSec = Math.max(1, result.retryAfterSeconds ?? 10);
        const retryAfterMs = retryAfterSec * 1000 + Math.floor(Math.random() * 1000);
        this.rateLimitResetAt = Date.now() + retryAfterMs;

        const nextAttempt = new Date(Date.now() + retryAfterMs);
        await this.store.scheduleRetry(
          record.id,
          leaseToken,
          nextAttempt,
          `telegram_rate_limited (retry_after ${retryAfterSec}s): ${errorMsg}`,
        );
        this.logger(
          `[telegram-outbox] Message ${record.id} rate limited. Retrying after ${retryAfterSec}s.`,
        );
        return;
      }

      // 2. Permanent Failure (invalid chat, token, blocked, unauthorized)
      if (result.isPermanentError) {
        await this.store.markDeadLetter(
          record.id,
          leaseToken,
          `permanent_error: ${errorMsg}`,
        );
        this.logger(
          `[telegram-outbox] Message ${record.id} marked dead_letter due to permanent error: ${errorMsg}`,
        );
        return;
      }

      // 3. Transient Error (network timeout, 5xx, socket disconnect, proxy error)
      const currentAttempts = record.attempts; // attempts was already incremented upon claim
      const maxAllowed = record.maxAttempts || this.maxAttempts;
      const isCritical = isCriticalOutboxCategory(record.category);

      // Non-critical alerts are moved to dead_letter after maxAttempts.
      // Critical alerts (financial, security, operational alerts) continue background retry at maxDelayMs,
      // ensuring that prolonged SOCKS5/network dropouts never cause permanent silent loss.
      if (currentAttempts >= maxAllowed && !isCritical) {
        await this.store.markDeadLetter(
          record.id,
          leaseToken,
          `max_attempts_exceeded (${currentAttempts}/${maxAllowed}): ${errorMsg}`,
        );
        this.logger(
          `[telegram-outbox] Message ${record.id} exceeded max attempts (${maxAllowed}). Moved to dead_letter.`,
        );
        return;
      }

      // Exponential backoff with jitter
      const expDelay = this.baseDelayMs * Math.pow(2, Math.max(0, currentAttempts - 1));
      const jitter = Math.floor(Math.random() * Math.min(2000, this.baseDelayMs));
      const delayMs = Math.min(this.maxDelayMs, expDelay + jitter);
      const nextAttempt = new Date(Date.now() + delayMs);

      const statusNote = isCritical && currentAttempts >= maxAllowed
        ? `transient_error [persistent_retry attempt ${currentAttempts}]: ${errorMsg}`
        : `transient_error: ${errorMsg}`;

      await this.store.scheduleRetry(
        record.id,
        leaseToken,
        nextAttempt,
        statusNote,
      );

      if (isCritical && currentAttempts >= maxAllowed) {
        this.logger(
          `[telegram-outbox] Critical message ${record.id} (${record.category}) reached attempt ${currentAttempts}. Persisting retry in ${Math.round(delayMs / 1000)}s: ${errorMsg}`,
        );
      } else {
        this.logger(
          `[telegram-outbox] Message ${record.id} scheduled for retry (attempt ${currentAttempts + 1}) in ${Math.round(delayMs / 1000)}s: ${errorMsg}`,
        );
      }
    } catch (err: unknown) {
      const unexpected = err instanceof Error ? err.message : String(err);
      this.logger(
        `[telegram-outbox] Unexpected exception processing record ${record.id}: ${unexpected}`,
      );

      const delayMs = this.baseDelayMs + Math.floor(Math.random() * 1000);
      await this.store
        .scheduleRetry(
          record.id,
          leaseToken,
          new Date(Date.now() + delayMs),
          `unexpected_exception: ${unexpected}`,
        )
        .catch(() => {});
    }
  }

  /**
   * Interruptible sleep.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout | null = null;

      const onWake = () => {
        if (timer) clearTimeout(timer);
        resolve();
      };

      this.wakeUpResolver = onWake;

      timer = setTimeout(() => {
        this.wakeUpResolver = null;
        resolve();
      }, ms);
    });
  }
}
