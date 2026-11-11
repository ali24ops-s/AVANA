/**
 * Central Error Monitoring Service for AVANA.
 *
 * Provides:
 * - Deterministic, versioned error fingerprinting
 * - Sensitive data redaction and payload sanitization
 * - Bounded non-blocking async queue (Fail-Safe)
 * - Intelligent sampling (full count in groups, throttled occurrences)
 * - Layer-traversal deduplication using Symbols
 * - Isolation from primary business transactions
 */

import { createHash } from "node:crypto";
import pino from "pino";
import type { ErrorMonitoringStore } from "./error-monitoring-store.js";
import type {
  IngestErrorInput,
  FingerprintComponents,
  ErrorSeverity,
  ErrorSource,
} from "./error-monitoring-types.js";

export const CAPTURED_ERROR_SYMBOL = Symbol.for("avana.error.captured");
export const CAPTURE_IN_PROGRESS_SYMBOL = Symbol.for("avana.error.capture_in_progress");

import { sanitizeText } from "../utils/sanitize-text.js";
export { sanitizeText };

export type ObservabilityLogger = {
  info(arg1: unknown, ...args: unknown[]): void;
  warn(arg1: unknown, ...args: unknown[]): void;
  error(arg1: unknown, ...args: unknown[]): void;
  debug?(arg1: unknown, ...args: unknown[]): void;
};

export interface ErrorMonitoringServiceOptions {
  store: ErrorMonitoringStore;
  logger?: ObservabilityLogger;
  environment?: string;
  appVersion?: string;
  maxQueueSize?: number;
  maxConsecutiveFullErrors?: number;
  samplingFirstCount?: number;
  samplingIntervalRatio?: number;
}

export function isCapturedError(err: unknown): boolean {
  if (typeof err === "object" && err !== null) {
    return (err as Record<symbol, unknown>)[CAPTURED_ERROR_SYMBOL] === true;
  }
  return false;
}

export function markCapturedError(err: unknown): void {
  if (typeof err === "object" && err !== null) {
    try {
      Object.defineProperty(err, CAPTURED_ERROR_SYMBOL, {
        value: true,
        enumerable: false,
        configurable: true,
      });
    } catch {
      // Ignore if object is frozen
    }
  }
}

export const markErrorAsCaptured = markCapturedError;

export class ErrorMonitoringService {
  private readonly store: ErrorMonitoringStore;
  private readonly logger: ObservabilityLogger;
  private readonly environment: string;
  private readonly appVersion: string;
  private readonly maxQueueSize: number;

  private queueLength = 0;
  private droppedEventsCount = 0;
  private isShuttingDown = false;
  private readonly activeOperations = new Set<Promise<unknown>>();

  constructor(options: ErrorMonitoringServiceOptions) {
    this.store = options.store;
    this.logger = options.logger || pino({ level: process.env.LOG_LEVEL || "info" });
    this.environment = options.environment || process.env.NODE_ENV || "development";
    this.appVersion = options.appVersion || process.env.npm_package_version || "1.0.0";
    this.maxQueueSize = options.maxQueueSize ?? 500;
  }

  getStore(): ErrorMonitoringStore {
    return this.store;
  }

  getEnvironment(): string {
    return this.environment;
  }

  getAppVersion(): string {
    return this.appVersion;
  }

  getQueueLength(): number {
    return this.queueLength;
  }

  getDroppedEventsCount(): number {
    return this.droppedEventsCount;
  }

  isShutdown(): boolean {
    return this.isShuttingDown;
  }

  getActiveOperationsCount(): number {
    return this.activeOperations.size;
  }

  /**
   * Gracefully flushes and drains pending error persistence operations within timeout.
   * Awaits both scheduled tasks and active database operations.
   */
  async drain(timeoutMs = 5000): Promise<{ drained: boolean; pending: number }> {
    this.isShuttingDown = true;
    const startTime = Date.now();
    while (
      (this.activeOperations.size > 0 || this.queueLength > 0) &&
      Date.now() - startTime < timeoutMs
    ) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const pending = Math.max(this.activeOperations.size, this.queueLength);
    return {
      drained: pending === 0,
      pending,
    };
  }

  /**
   * Deterministically normalizes an error message without destroying distinguishing tokens.
   */
  normalizeErrorMessage(rawMsg: string): string {
    if (!rawMsg || typeof rawMsg !== "string") return "unknown_error";

    return (
      rawMsg
        // Normalize ISO timestamps first before integers or IPs
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, ":timestamp")
        // Normalize IP addresses before integers
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, ":ip")
        // Normalize UUIDs
        .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ":uuid")
        // Normalize hex addresses and mongo/hash IDs (24+ chars)
        .replace(/\b0x[0-9a-fA-F]+\b/g, ":hex")
        .replace(/\b[0-9a-fA-F]{24,64}\b/g, ":hash")
        // Normalize standalone integer IDs (e.g. /12345/ or id=123)
        .replace(/\b\d{3,}\b/g, ":id")
        .trim()
    );
  }

  /**
   * Extracts top non-node internal stack frame for fingerprinting.
   */
  extractTopStackFrame(stack?: string): string {
    if (!stack || typeof stack !== "string") return "";

    const lines = stack.split("\n");
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      // Skip node internals
      if (line.includes("node:internal") || line.includes("node:async_hooks")) {
        continue;
      }
      // Clean up column numbers to avoid fingerprint churn on minor line shifts
      return line.replace(/:\d+:\d+\)?$/, "");
    }
    return "";
  }

  /**
   * Computes deterministic versioned SHA-256 fingerprint.
   * Environment and fingerprintVersion are strict partitioning dimensions.
   * AppVersion is NOT part of fingerprint to prevent duplicate groups on simple deployments.
   */
  computeFingerprint(components: FingerprintComponents): string {
    const {
      fingerprintVersion,
      environment,
      source,
      feature,
      errorCode,
      normalizedMessage,
      topStackFrame,
    } = components;

    const payload = [
      `v${fingerprintVersion}`,
      environment,
      source,
      feature,
      errorCode || "",
      normalizedMessage,
      topStackFrame || "",
    ].join("|");

    return createHash("sha256").update(payload).digest("hex");
  }

  /**
   * Sanitizes sensitive fields from any context object recursively.
   * Enforces max depth (4), max total properties (100), and circular reference protection.
   * Passes all string values through sanitizeText.
   */
  sanitizeContext(
    obj: unknown,
    depth = 0,
    ancestors = new Set<object>(),
    propCounter = { count: 0, max: 100 },
  ): Record<string, unknown> {
    if (depth > 4 || typeof obj !== "object" || obj === null) {
      return {};
    }

    if (ancestors.has(obj)) {
      return { "[CIRCULAR]": true };
    }

    ancestors.add(obj);
    try {
      const SENSITIVE_KEY_PATTERNS = [
        /password/i,
        /token/i,
        /otp/i,
        /secret/i,
        /auth/i,
        /bearer/i,
        /cookie/i,
        /session/i,
        /apikey/i,
        /api_key/i,
        /gemini/i,
        /resend/i,
        /privatekey/i,
        /private_key/i,
        /credential/i,
        /nationalid/i,
        /cardnumber/i,
        /cvv/i,
      ];

      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        if (propCounter.count >= propCounter.max) {
          result["[TRUNCATED]"] = "Max context properties exceeded";
          break;
        }
        propCounter.count += 1;

        const lower = key.toLowerCase().replace(/[-_]/g, "");
        const isSensitive = SENSITIVE_KEY_PATTERNS.some(
          (pattern) => pattern.test(key) || pattern.test(lower),
        );

        if (isSensitive) {
          result[key] = "[REDACTED]";
          continue;
        }

        if (value === null || value === undefined) {
          result[key] = value;
        } else if (typeof value === "string") {
          let sanitizedString = value;
          // Strip query string if key represents a URL or path
          if (
            lower.includes("url") ||
            lower.includes("path") ||
            lower.includes("endpoint") ||
            lower.includes("uri")
          ) {
            sanitizedString = sanitizedString.split("?")[0];
          }
          // Sanitize any sensitive strings within value
          sanitizedString = sanitizeText(sanitizedString);
          // Truncate overly long strings
          result[key] =
            sanitizedString.length > 500
              ? `${sanitizedString.slice(0, 500)}...[TRUNCATED]`
              : sanitizedString;
        } else if (typeof value === "number" || typeof value === "boolean") {
          result[key] = value;
        } else if (Array.isArray(value)) {
          result[key] = value
            .slice(0, 20)
            .map((v) => {
              if (typeof v === "string") {
                const clean = sanitizeText(v);
                return clean.length > 500 ? `${clean.slice(0, 500)}...[TRUNCATED]` : clean;
              }
              if (typeof v === "object" && v !== null) {
                return this.sanitizeContext(v, depth + 1, ancestors, propCounter);
              }
              return v;
            });
        } else if (typeof value === "object") {
          result[key] = this.sanitizeContext(value, depth + 1, ancestors, propCounter);
        }
      }

      return result;
    } finally {
      ancestors.delete(obj);
    }
  }

  /**
   * Central policy classifier: determines if an error warrants system error recording.
   * Filters out expected 401s, 403s, 404s, and client validation errors.
   */
  shouldCapture(err: unknown, statusCode?: number): boolean {
    if (isCapturedError(err)) {
      return false; // Prevent duplicate capturing across hooks/handlers
    }

    // Normal client authorization / authentication drops
    if (statusCode === 401 || statusCode === 403 || statusCode === 404) {
      return false;
    }

    // Normal client input validation errors (400) unless server bug
    if (statusCode === 400 || statusCode === 422 || statusCode === 429) {
      return false;
    }

    // DomainError inspection
    if (typeof err === "object" && err !== null && "code" in err) {
      const code = String((err as Record<string, unknown>).code);
      const IGNORED_CODES = new Set([
        "SESSION_REVOKED",
        "UNAUTHORIZED",
        "DEVICE_LIMIT_REACHED",
        "not_found",
        "bad_request",
        "forbidden",
        "too_many_requests",
        "rate_limit_exceeded",
        "conflict",
        "unprocessable",
      ]);
      if (IGNORED_CODES.has(code)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Captures an error event safely and asynchronously.
   * Guarantees:
   * 1. Never throws or rejects unhandled promises.
   * 2. Marks the error object to avoid duplicate traversal.
   * 3. Sanitizes all context variables.
   * 4. Enforces in-process bounded queue.
   */
  captureError(input: IngestErrorInput): void {
    try {
      if (this.isShuttingDown) {
        this.logger.warn(
          { requestId: input.requestId },
          "[error-monitoring] Service is shutting down, dropping error occurrence",
        );
        return;
      }

      const { error: rawError } = input;

      // Deduplication check
      if (rawError && isCapturedError(rawError)) {
        return;
      }
      if (rawError) {
        markCapturedError(rawError);
      }

      // Check queue capacity (Fail-Safe drop)
      if (this.queueLength >= this.maxQueueSize) {
        this.droppedEventsCount += 1;
        this.logger.warn(
          { queueLength: this.queueLength, droppedEventsCount: this.droppedEventsCount },
          "[error-monitoring] Queue is full, dropping error occurrence safely",
        );
        return;
      }

      this.queueLength += 1;

      // Track active operation synchronously and immediately before scheduling
      let resolveOp!: () => void;
      const op = new Promise<void>((resolve) => {
        resolveOp = resolve;
      });
      this.activeOperations.add(op);

      // Execute non-blocking in next tick, tracking active promise for drain
      setImmediate(() => {
        void this.processCapture(input)
          .catch((err) => {
            this.logger.error({ err }, "[error-monitoring] Async capture execution failed");
          })
          .finally(() => {
            this.activeOperations.delete(op);
            this.queueLength = Math.max(0, this.queueLength - 1);
            resolveOp();
          });
      });
    } catch (err) {
      this.logger.error({ err }, "[error-monitoring] Synchronous capture error swallowed");
    }
  }

  /**
   * Captures an error event and awaits its persistence.
   * Useful for test suites, synchronous batch jobs, or operations needing confirmation.
   */
  async captureErrorAsync(input: IngestErrorInput): Promise<void> {
    try {
      if (this.isShuttingDown) {
        this.droppedEventsCount += 1;
        this.logger.warn(
          { requestId: input.requestId },
          "[error-monitoring] Service is shutting down, dropping error occurrence",
        );
        return;
      }
      const { error: rawError } = input;
      if (rawError && isCapturedError(rawError)) {
        return;
      }
      if (rawError) {
        markCapturedError(rawError);
      }
      const op = this.processCapture(input);
      this.activeOperations.add(op);
      try {
        await op;
      } finally {
        this.activeOperations.delete(op);
      }
    } catch (err) {
      this.logger.error({ err }, "[error-monitoring] captureErrorAsync swallowed error");
    }
  }

  readonly captureErrorSync = (input: IngestErrorInput): Promise<void> => {
    return this.captureErrorAsync(input);
  };

  private async processCapture(input: IngestErrorInput): Promise<void> {
    const err = input.error;
    let message = input.message;
    let stackTrace = input.stackTrace;
    let errorCode = input.errorCode;

    if (err instanceof Error) {
      message = message || err.message;
      stackTrace = stackTrace || err.stack;
      if (!errorCode && "code" in err && typeof (err as Record<string, unknown>).code === "string") {
        errorCode = (err as Record<string, unknown>).code as string;
      }
    } else if (typeof err === "string" && !message) {
      message = err;
    } else if (typeof err === "object" && err !== null) {
      const anyErr = err as Record<string, unknown>;
      message = message || (typeof anyErr.message === "string" ? anyErr.message : JSON.stringify(err));
      if (!errorCode && typeof anyErr.code === "string") {
        errorCode = anyErr.code;
      }
    }

    message = message || "Unknown error";
    // Sanitize message across all representations
    const cleanMessage = sanitizeText(message);
    const normalizedMessage = this.normalizeErrorMessage(cleanMessage);
    const topStackFrame = this.extractTopStackFrame(stackTrace);

    const environment = input.environment || this.environment;
    const source: ErrorSource = input.source || "backend";
    const severity: ErrorSeverity = input.severity || "error";
    const feature = input.feature || "system";
    const fingerprintVersion = 1;

    const fingerprint = this.computeFingerprint({
      fingerprintVersion,
      environment,
      source,
      feature,
      errorCode,
      normalizedMessage,
      topStackFrame,
    });

    const sanitizedContext = this.sanitizeContext(input.context || {});
    const occurredAt = input.occurredAt
      ? typeof input.occurredAt === "string"
        ? new Date(input.occurredAt)
        : input.occurredAt
      : new Date();

    const title = cleanMessage.length > 255 ? `${cleanMessage.slice(0, 252)}...` : cleanMessage;
    let cleanStackTrace = stackTrace ? sanitizeText(stackTrace) : stackTrace;
    if (cleanStackTrace && cleanStackTrace.length > 4000) {
      cleanStackTrace = `${cleanStackTrace.slice(0, 4000)}\n[TRUNCATED]`;
    }

    try {
      await this.store.recordOccurrence({
        group: {
          fingerprint,
          fingerprintVersion,
          environment,
          source,
          severity,
          feature,
          errorCode: errorCode || null,
          title,
          status: "unresolved",
          appVersion: input.appVersion || this.appVersion,
        },
        event: {
          fingerprint,
          requestId: input.requestId || null,
          correlationId: input.correlationId || null,
          operation: input.operation || null,
          failureStage: input.failureStage || null,
          userId: input.userId || null,
          organizationId: input.organizationId || null,
          courseId: input.courseId || null,
          endpoint: input.endpoint ? sanitizeText(input.endpoint.split("?")[0]) : null,
          httpMethod: input.httpMethod || null,
          httpStatus: input.httpStatus || null,
          stackTrace: cleanStackTrace || null,
          sanitizedContext,
          occurredAt,
        },
        userId: input.userId,
      });
    } catch (storeError) {
      // Fail-Safe: log structured Pino log without re-entering ErrorMonitoringService
      this.logger.error(
        {
          err: storeError instanceof Error ? storeError.message : String(storeError),
          fingerprint,
          requestId: input.requestId,
        },
        "[error-monitoring] Storage failure when persisting error event",
      );
    }
  }
}
