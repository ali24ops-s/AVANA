/**
 * Observability module — Public API.
 *
 * PR-11: Exports audit, logger, and metrics primitives.
 */

export type { AuditStore } from "./audit-store.js";
export { AuditService } from "./audit-service.js";
export { createLogger } from "./logger.js";
export { MetricsCollector, metrics } from "./metrics.js";
export type { MetricCounter } from "./metrics.js";
export { observabilityPlugin } from "./plugin.js";
export type { ObservabilityPluginOptions } from "./plugin.js";
export { TelegramClient } from "./telegram-client.js";
export type { TelegramClientOptions, TelegramSendMessageResult } from "./telegram-client.js";
export { AdminAlertService } from "./admin-alert-service.js";
export type { AdminAlertServiceOptions, AlertPayload, AlertSeverity } from "./admin-alert-service.js";
export { TelegramOpsBot } from "./telegram-ops-bot.js";
export type { TelegramOpsBotOptions } from "./telegram-ops-bot.js";
export * from "./error-monitoring-types.js";
export type { ErrorMonitoringStore, RecordOccurrenceInput, RecordOccurrenceResult } from "./error-monitoring-store.js";
export { InMemoryErrorStore } from "./in-memory-error-store.js";
export { DrizzleErrorStore } from "./drizzle-error-store.js";
export { ErrorMonitoringService, CAPTURED_ERROR_SYMBOL, CAPTURE_IN_PROGRESS_SYMBOL, isCapturedError, markCapturedError, markErrorAsCaptured, sanitizeText } from "./error-monitoring-service.js";
export type { ErrorMonitoringServiceOptions } from "./error-monitoring-service.js";
