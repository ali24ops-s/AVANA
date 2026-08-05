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
