/**
 * Educational & Scientific Chart Domain Types for AVANA.
 *
 * Framework-independent primitives for structured chart representation within
 * educational content. All charts are stored natively within Markdown as JSON
 * code blocks (single source of truth).
 */

export type ChartType = "bar" | "line" | "pie" | "scatter";

export interface ChartDataPoint {
  label?: string;
  value?: number;
  x?: number | string;
  y?: number;
}

export interface ChartSeries {
  name?: string;
  data: ChartDataPoint[];
}

export interface ChartAxis {
  label?: string;
  unit?: string;
}

export interface EducationalChart {
  id?: string;
  type: ChartType;
  title: string;
  description?: string;
  xAxis?: ChartAxis;
  yAxis?: ChartAxis;
  series: ChartSeries[];
  /** Convenience single-series / pie dataset */
  data?: ChartDataPoint[];
  /** Optional overall unit (e.g. "%", "mg/L") */
  unit?: string;
  /** Provenance citation or reference section */
  sourceCitation?: string;
}

export interface ChartValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  chart?: EducationalChart;
}
