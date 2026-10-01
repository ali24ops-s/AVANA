/**
 * Educational & Scientific Chart Domain Types for AVANA.
 *
 * Framework-independent primitives for structured chart representation within
 * educational content. All charts are stored natively within Markdown as JSON
 * code blocks (single source of truth).
 */

export type ChartMode = "data" | "conceptual";

export type ChartType = "bar" | "line" | "pie" | "scatter";

export type AxisScale = "linear" | "log";

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
  scale?: AxisScale;
  min?: number;
  max?: number;
}

export interface ParametricCurve {
  name: string;
  model: "sigmoidal";
  parameters: {
    emax: number;
    logEC50: number;
    hillSlope?: number;
    baseline?: number;
  };
  parameterSemantics?: "normalized" | "source_based";
  lineStyle?: "solid" | "dashed";
  color?: string;
}

export interface EducationalChart {
  id?: string;
  type: ChartType;
  mode?: ChartMode;
  title: string;
  description?: string;
  xAxis?: ChartAxis;
  yAxis?: ChartAxis;
  series?: ChartSeries[];
  /** Convenience single-series / pie dataset */
  data?: ChartDataPoint[];
  /** Parametric scientific curves (e.g. Hill/sigmoidal dose-response models) */
  curves?: ParametricCurve[];
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

/**
 * Deterministic density cap: maximum allowed charts per educational session.
 * Aligns with Section 12.3 EDUCATIONAL_CHART_POLICY ("Maximum 1-2 charts per session").
 */
export const MAX_CHARTS_PER_SESSION = 2;

/**
 * High-level pedagogical visualization intent emitted by the content planner.
 * Purely declarative — does NOT contain mathematical parameters, curve equations, or data points.
 */
export interface SuggestedVisualization {
  type: ChartType;
  mode: ChartMode;
  concept: string;
  rationale: string;
  sourceDataRequired: boolean;
  citationChunkIds?: string[];
}
