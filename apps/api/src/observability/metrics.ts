/**
 * Minimal in-process metrics counters.
 *
 * PR-11: Provides simple counters for:
 * - HTTP request count (by method + route)
 * - HTTP error count (by status code)
 * - Authentication outcomes (success, failure)
 * - Course mutations (create, update, archive)
 *
 * No OpenTelemetry SDK, collectors, exporters, or infrastructure.
 * Values are reset on process restart.
 */

export type MetricCounter = {
  name: string;
  labels: Record<string, string>;
  value: number;
};

export class MetricsCollector {
  private readonly counters: Map<string, number> = new Map();

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  /** Increment a counter by 1. */
  increment(name: string, labels?: Record<string, string>): void {
    const k = this.key(name, labels);
    this.counters.set(k, (this.counters.get(k) ?? 0) + 1);
  }

  /** Get current value of a counter (0 if never incremented). */
  get(name: string, labels?: Record<string, string>): number {
    return this.counters.get(this.key(name, labels)) ?? 0;
  }

  /** Snapshot all counters for debug/reporting. */
  snapshot(): MetricCounter[] {
    const result: MetricCounter[] = [];
    for (const [k, value] of this.counters) {
      // Parse key back into name and labels
      const braceIdx = k.indexOf("{");
      if (braceIdx === -1) {
        result.push({ name: k, labels: {}, value });
      } else {
        const name = k.slice(0, braceIdx);
        const labelStr = k.slice(braceIdx + 1, -1);
        const labels: Record<string, string> = {};
        for (const part of labelStr.split(",")) {
          const eqIdx = part.indexOf("=");
          if (eqIdx !== -1) {
            labels[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
          }
        }
        result.push({ name, labels, value });
      }
    }
    return result;
  }

  /** Reset all counters. */
  reset(): void {
    this.counters.clear();
  }
}

/** Singleton metrics collector. */
export const metrics = new MetricsCollector();
