/**
 * Educational & Scientific Chart Parsing and Validation Engine for AVANA.
 *
 * Guarantees:
 * 1. Strict, deterministic JSON parsing for ```chart code blocks.
 * 2. Normalization of Persian/Arabic digits to standard numeric values.
 * 3. Strict rejection of NaN, Infinity, and empty or malformed datasets.
 * 4. Production-safe error handling: Never throws unhandled exceptions.
 * 5. Type-specific invariant validation for bar, line, pie, and scatter charts.
 */

import type {
  ChartAxis,
  ChartDataPoint,
  ChartSeries,
  ChartType,
  ChartValidationResult,
  EducationalChart,
} from "./types.js";

const VALID_CHART_TYPES: readonly ChartType[] = ["bar", "line", "pie", "scatter"];

export const MAX_CHART_DATA_POINTS = 250;

const PERSIAN_ARABIC_DIGIT_MAP: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/**
 * Normalizes Persian, Arabic, or formatted numeric strings into standard JavaScript numbers.
 * Returns null if the value is NaN, Infinity, or unparseable.
 */
export function parseFlexibleNumber(val: unknown): number | null {
  if (typeof val === "number") {
    if (Number.isNaN(val) || !Number.isFinite(val)) {
      return null;
    }
    return val;
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Convert Persian and Arabic digits to ASCII
    const asciiStr = trimmed.replace(/[۰-۹٠-٩]/g, (char) => PERSIAN_ARABIC_DIGIT_MAP[char] ?? char);

    // Remove standard thousands commas while preserving decimal points
    const cleanStr = asciiStr.replace(/,/g, "");

    const parsed = Number(cleanStr);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  }

  return null;
}

/**
 * Normalizes a data point object into a valid ChartDataPoint.
 */
function normalizeDataPoint(raw: unknown, chartType: ChartType): ChartDataPoint | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;

  const label =
    typeof item.label === "string"
      ? item.label.trim()
      : typeof item.name === "string"
      ? item.name.trim()
      : typeof item.x === "string"
      ? item.x.trim()
      : undefined;

  if (chartType === "scatter") {
    const numX = parseFlexibleNumber(item.x);
    const numY = parseFlexibleNumber(item.y ?? item.value);

    if (numX === null || numY === null) {
      return null;
    }

    return {
      x: numX,
      y: numY,
      label,
    };
  }

  // Bar, Line, Pie
  const numVal = parseFlexibleNumber(item.value ?? item.y);
  if (numVal === null) {
    return null;
  }

  const rawX = item.x;
  const normalizedX =
    typeof rawX === "number"
      ? parseFlexibleNumber(rawX) ?? undefined
      : typeof rawX === "string"
      ? rawX.trim()
      : label;

  return {
    label: label ?? (normalizedX !== undefined ? String(normalizedX) : undefined),
    value: numVal,
    x: normalizedX,
    y: numVal,
  };
}

/**
 * Normalizes an axis definition.
 */
function normalizeAxis(raw: unknown): ChartAxis | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  const label = typeof obj.label === "string" ? obj.label.trim() : typeof obj.title === "string" ? obj.title.trim() : undefined;
  const unit = typeof obj.unit === "string" ? obj.unit.trim() : undefined;

  if (!label && !unit) return undefined;
  return { label, unit };
}

/**
 * Pure, deterministic parser for ```chart code blocks with strict JSON payload.
 * Returns null if the content is not valid JSON or does not contain required chart fields.
 */
export function parseChartCodeContent(raw: string, lang = "chart"): EducationalChart | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalizedLang = lang.toLowerCase().trim();
  if (
    normalizedLang !== "chart" &&
    normalizedLang !== "chart-json" &&
    normalizedLang !== "charts"
  ) {
    return null;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const rawType = typeof parsed.type === "string" ? parsed.type.toLowerCase().trim() : "";
  if (!VALID_CHART_TYPES.includes(rawType as ChartType)) {
    return null;
  }
  const type = rawType as ChartType;

  const title =
    typeof parsed.title === "string" && parsed.title.trim().length > 0
      ? parsed.title.trim()
      : "نمودار آموزشی";

  const description =
    typeof parsed.description === "string" && parsed.description.trim().length > 0
      ? parsed.description.trim()
      : undefined;

  const unit = typeof parsed.unit === "string" ? parsed.unit.trim() : undefined;
  const sourceCitation =
    typeof parsed.sourceCitation === "string"
      ? parsed.sourceCitation.trim()
      : typeof parsed.citation === "string"
      ? parsed.citation.trim()
      : undefined;

  const xAxis = normalizeAxis(parsed.xAxis);
  const yAxis = normalizeAxis(parsed.yAxis);

  // Normalize Series
  const series: ChartSeries[] = [];

  if (Array.isArray(parsed.series) && parsed.series.length > 0) {
    for (const s of parsed.series) {
      if (s && typeof s === "object") {
        const sObj = s as Record<string, unknown>;
        const name = typeof sObj.name === "string" ? sObj.name.trim() : undefined;
        const rawData = Array.isArray(sObj.data) ? sObj.data : [];

        const validPoints: ChartDataPoint[] = [];
        for (const pt of rawData) {
          const normalizedPt = normalizeDataPoint(pt, type);
          if (normalizedPt) {
            validPoints.push(normalizedPt);
          }
        }

        if (validPoints.length > 0) {
          series.push({ name, data: validPoints });
        }
      }
    }
  } else if (Array.isArray(parsed.data) && parsed.data.length > 0) {
    // Single-series or Pie convenience format
    const validPoints: ChartDataPoint[] = [];
    for (const pt of parsed.data) {
      const normalizedPt = normalizeDataPoint(pt, type);
      if (normalizedPt) {
        validPoints.push(normalizedPt);
      }
    }

    if (validPoints.length > 0) {
      series.push({
        name: typeof parsed.seriesName === "string" ? parsed.seriesName.trim() : title,
        data: validPoints,
      });
    }
  }

  const primaryData = series.length === 1 ? series[0].data : undefined;

  return {
    id: typeof parsed.id === "string" ? parsed.id.trim() : undefined,
    type,
    title,
    description,
    xAxis,
    yAxis,
    series,
    data: primaryData,
    unit,
    sourceCitation,
  };
}

/**
 * Validates an EducationalChart against mathematical, semantic, and chart-type rules.
 */
export function validateEducationalChart(chart: unknown): ChartValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!chart || typeof chart !== "object") {
    return {
      valid: false,
      errors: ["ساختار داده نمودار نامعتبر است."],
      warnings: [],
    };
  }

  const c = chart as EducationalChart;

  if (!VALID_CHART_TYPES.includes(c.type)) {
    errors.push(`نوع نمودار نامعتبر است: '${c.type}'. انواع مجاز: ${VALID_CHART_TYPES.join(", ")}`);
  }

  if (!c.title || typeof c.title !== "string" || c.title.trim().length === 0) {
    warnings.push("عنوان نمودار خالی است.");
  }

  if (!Array.isArray(c.series) || c.series.length === 0) {
    errors.push("نمودار فاقد سری داده (series) است.");
  } else {
    let totalPoints = 0;

    for (let i = 0; i < c.series.length; i++) {
      const s = c.series[i];
      if (!s || !Array.isArray(s.data) || s.data.length === 0) {
        errors.push(`سری شماره ${i + 1} فاقد نقطه داده معتبر است.`);
        continue;
      }

      totalPoints += s.data.length;

      for (let j = 0; j < s.data.length; j++) {
        const pt = s.data[j];

        if (c.type === "scatter") {
          if (typeof pt.x !== "number" || Number.isNaN(pt.x) || !Number.isFinite(pt.x)) {
            errors.push(`مختصات x در سری ${i + 1} نقطه ${j + 1} نامعتبر یا خالی است.`);
          }
          if (typeof pt.y !== "number" || Number.isNaN(pt.y) || !Number.isFinite(pt.y)) {
            errors.push(`مختصات y در سری ${i + 1} نقطه ${j + 1} نامعتبر یا خالی است.`);
          }
        } else {
          // Bar, Line, Pie
          const val = pt.value ?? pt.y;
          if (typeof val !== "number" || Number.isNaN(val) || !Number.isFinite(val)) {
            errors.push(`مقدار عددی در سری ${i + 1} نقطه ${j + 1} نامعتبر است.`);
          }

          if (c.type === "pie" && typeof val === "number" && val < 0) {
            errors.push(`مقدار سهم در نمودار دایره‌ای نمی‌تواند منفی باشد (${val}).`);
          }
        }
      }
    }

    if (totalPoints === 0 && errors.length === 0) {
      errors.push("نمودار هیچ نقطه داده معتبری ندارد.");
    }

    if (totalPoints > MAX_CHART_DATA_POINTS) {
      errors.push(
        `تعداد کل نقاط داده نمودار (${totalPoints}) از سقف مجاز (${MAX_CHART_DATA_POINTS}) بیشتر است.`,
      );
    }

    // Pie chart specific invariant: Sum of slices must be > 0
    if (c.type === "pie" && c.series[0]?.data) {
      const sum = c.series[0].data.reduce((acc, p) => acc + (p.value ?? 0), 0);
      if (sum <= 0) {
        errors.push("مجموع مقادیر نمودار دایره‌ای باید بزرگ‌تر از صفر باشد.");
      }
      if (c.series.length > 1) {
        warnings.push("نمودار دایره‌ای معمولاً با یک سری داده نمایش داده می‌شود.");
      }
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    chart: valid ? c : undefined,
  };
}

/**
 * Extracts and validates all educational charts embedded in a lesson markdown.
 */
export function extractEducationalChartsFromMarkdown(markdown: string): EducationalChart[] {
  if (!markdown || typeof markdown !== "string") return [];

  const charts: EducationalChart[] = [];
  const codeBlockRegex = /```(chart|chart-json|charts)\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const lang = match[1].toLowerCase();
    const rawContent = match[2];
    const parsed = parseChartCodeContent(rawContent, lang);
    if (parsed) {
      const validation = validateEducationalChart(parsed);
      if (validation.valid && validation.chart) {
        charts.push(validation.chart);
      }
    }
  }

  return charts;
}
