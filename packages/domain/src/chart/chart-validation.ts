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

import {
  type AxisScale,
  type ChartAxis,
  type ChartDataPoint,
  type ChartMode,
  type ChartSeries,
  type ChartType,
  type ChartValidationResult,
  type EducationalChart,
  type ParametricCurve,
  type SuggestedVisualization,
  MAX_CHARTS_PER_SESSION,
} from "./types.js";
import { matchCanonicalConceptKey } from "./canonical-concepts.js";

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
  const rawScale = typeof obj.scale === "string" ? obj.scale.toLowerCase().trim() : undefined;
  const scale: AxisScale | undefined = rawScale === "log" ? "log" : rawScale === "linear" ? "linear" : undefined;
  const min = parseFlexibleNumber(obj.min) ?? undefined;
  const max = parseFlexibleNumber(obj.max) ?? undefined;

  if (!label && !unit && !scale && min === undefined && max === undefined) return undefined;
  return { label, unit, scale, min, max };
}

/**
 * Normalizes a parametric curve specification.
 */
function normalizeParametricCurve(raw: unknown): ParametricCurve | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "منحنی";
  const model = "sigmoidal";
  const params = (obj.parameters ?? obj.params) as Record<string, unknown> | undefined;
  if (!params || typeof params !== "object") return null;

  const emax = parseFlexibleNumber(params.emax);
  const logEC50 = parseFlexibleNumber(params.logEC50 ?? params.logEc50);
  if (emax === null || logEC50 === null) return null;

  const hillSlope = parseFlexibleNumber(params.hillSlope ?? params.hillslope);
  const baseline = parseFlexibleNumber(params.baseline);

  const rawSemantics = typeof obj.parameterSemantics === "string" ? obj.parameterSemantics.trim() : undefined;
  const parameterSemantics = rawSemantics === "source_based" ? "source_based" : "normalized";
  const lineStyle = obj.lineStyle === "dashed" ? "dashed" : "solid";
  const color = typeof obj.color === "string" ? obj.color.trim() : undefined;

  return {
    name,
    model,
    parameters: {
      emax,
      logEC50,
      ...(hillSlope !== null ? { hillSlope } : {}),
      ...(baseline !== null ? { baseline } : {}),
    },
    parameterSemantics,
    lineStyle,
    color,
  };
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

  const rawMode = typeof parsed.mode === "string" ? parsed.mode.toLowerCase().trim() : undefined;
  const mode: ChartMode | undefined = rawMode === "conceptual" ? "conceptual" : rawMode === "data" ? "data" : undefined;

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

  // Normalize Parametric Curves
  const curves: ParametricCurve[] = [];
  if (Array.isArray(parsed.curves) && parsed.curves.length > 0) {
    for (const item of parsed.curves) {
      const normalizedCurve = normalizeParametricCurve(item);
      if (normalizedCurve) {
        curves.push(normalizedCurve);
      }
    }
  }

  const primaryData = series.length === 1 ? series[0].data : undefined;

  return {
    id: typeof parsed.id === "string" ? parsed.id.trim() : undefined,
    type,
    mode,
    title,
    description,
    xAxis,
    yAxis,
    series: series.length > 0 ? series : (curves.length > 0 ? undefined : []),
    data: primaryData,
    curves: curves.length > 0 ? curves : undefined,
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

  // Log scale validations for X axis
  if (c.xAxis?.scale === "log") {
    if (c.xAxis.min !== undefined) {
      if (typeof c.xAxis.min !== "number" || !Number.isFinite(c.xAxis.min) || c.xAxis.min <= 0) {
        errors.push("حداقل مقدار محور لگاریتمی (min) باید بزرگ‌تر از صفر باشد.");
      }
    }
    if (c.xAxis.max !== undefined) {
      if (typeof c.xAxis.max !== "number" || !Number.isFinite(c.xAxis.max) || c.xAxis.max <= 0) {
        errors.push("حداکثر مقدار محور لگاریتمی (max) باید بزرگ‌تر از صفر باشد.");
      }
    }
    if (
      c.xAxis.min !== undefined &&
      c.xAxis.max !== undefined &&
      Number.isFinite(c.xAxis.min) &&
      Number.isFinite(c.xAxis.max) &&
      c.xAxis.min >= c.xAxis.max
    ) {
      errors.push("حداقل مقدار محور باید کوچک‌تر از حداکثر مقدار باشد.");
    }
  }

  // sourceCitation checks:
  // - Legacy charts: c.mode is undefined -> no warning, no error (100% backward compatible)
  // - mode === "data": warning only, not an error
  // - mode === "conceptual": no warning, no error
  if (c.mode === "data" && (!c.sourceCitation || typeof c.sourceCitation !== "string" || c.sourceCitation.trim().length === 0)) {
    warnings.push("منبع استناد (sourceCitation) برای داده‌های تجربی ذکر نشده است.");
  }

  const hasSeries = Array.isArray(c.series) && c.series.length > 0;
  const hasCurves = Array.isArray(c.curves) && c.curves.length > 0;

  if (!hasSeries && !hasCurves) {
    errors.push("نمودار فاقد سری داده (series) است.");
  }

  // Validate Curves if present
  if (hasCurves) {
    if (c.type !== "line") {
      errors.push("منحنی‌های پارامتریک فقط برای نمودارهای خطی (line) مجاز هستند.");
    }

    const isPercentUnit = c.unit === "%" || c.yAxis?.unit === "%" || c.unit === "درصد" || c.yAxis?.unit === "درصد";

    for (let i = 0; i < c.curves!.length; i++) {
      const curve = c.curves![i];
      if (!curve || typeof curve !== "object") {
        errors.push(`منحنی شماره ${i + 1} ساختار نامعتبر دارد.`);
        continue;
      }

      if (curve.model !== "sigmoidal") {
        errors.push(`مدل منحنی شماره ${i + 1} نامعتبر است: '${curve.model}'. مدل مجاز: sigmoidal`);
      }

      const params = curve.parameters;
      if (!params || typeof params !== "object") {
        errors.push(`پارامترهای منحنی شماره ${i + 1} تعریف نشده است.`);
        continue;
      }

      if (typeof params.emax !== "number" || !Number.isFinite(params.emax)) {
        errors.push(`مقدار emax در منحنی شماره ${i + 1} نامعتبر یا خالی است.`);
      } else if (isPercentUnit && (params.emax < -100 || params.emax > 250)) {
        errors.push(`مقدار emax درصدی در منحنی شماره ${i + 1} خارج از محدوده مجاز (-100 تا 250) است.`);
      }

      if (typeof params.logEC50 !== "number" || !Number.isFinite(params.logEC50)) {
        errors.push(`مقدار logEC50 در منحنی شماره ${i + 1} نامعتبر یا خالی است.`);
      }

      if (params.hillSlope !== undefined) {
        if (typeof params.hillSlope !== "number" || !Number.isFinite(params.hillSlope) || params.hillSlope <= 0) {
          errors.push(`ضریب هیل (hillSlope) در منحنی شماره ${i + 1} باید عددی مثبت و بزرگ‌تر از صفر باشد.`);
        }
      }

      if (params.baseline !== undefined) {
        if (typeof params.baseline !== "number" || !Number.isFinite(params.baseline)) {
          errors.push(`مقدار baseline در منحنی شماره ${i + 1} نامعتبر است.`);
        }
      }
    }
  }

  // Validate Series if present
  if (hasSeries) {
    let totalPoints = 0;
    const isLogX = c.xAxis?.scale === "log";

    for (let i = 0; i < c.series!.length; i++) {
      const s = c.series![i];
      if (!s || !Array.isArray(s.data) || s.data.length === 0) {
        errors.push(`سری شماره ${i + 1} فاقد نقطه داده معتبر است.`);
        continue;
      }

      totalPoints += s.data.length;

      for (let j = 0; j < s.data.length; j++) {
        const pt = s.data[j];

        if (c.type === "scatter") {
          if (typeof pt.x !== "number" || !Number.isFinite(pt.x)) {
            errors.push(`مختصات x در سری ${i + 1} نقطه ${j + 1} نامعتبر یا خالی است.`);
          } else if (isLogX && pt.x <= 0) {
            errors.push(`در مقیاس لگاریتمی، مقدار x در سری ${i + 1} نقطه ${j + 1} باید بزرگ‌تر از صفر باشد (${pt.x}).`);
          }
          if (typeof pt.y !== "number" || !Number.isFinite(pt.y)) {
            errors.push(`مختصات y در سری ${i + 1} نقطه ${j + 1} نامعتبر یا خالی است.`);
          }
        } else {
          // Bar, Line, Pie
          const val = pt.value ?? pt.y;
          if (typeof val !== "number" || !Number.isFinite(val)) {
            errors.push(`مقدار عددی در سری ${i + 1} نقطه ${j + 1} نامعتبر است.`);
          }

          if (isLogX && typeof pt.x === "number" && pt.x <= 0) {
            errors.push(`در مقیاس لگاریتمی، مقدار x در سری ${i + 1} نقطه ${j + 1} باید بزرگ‌تر از صفر باشد (${pt.x}).`);
          }

          if (c.type === "pie" && typeof val === "number" && val < 0) {
            errors.push(`مقدار سهم در نمودار دایره‌ای نمی‌تواند منفی باشد (${val}).`);
          }
        }
      }
    }

    if (totalPoints === 0 && errors.length === 0 && !hasCurves) {
      errors.push("نمودار هیچ نقطه داده معتبری ندارد.");
    }

    if (totalPoints > MAX_CHART_DATA_POINTS) {
      errors.push(
        `تعداد کل نقاط داده نمودار (${totalPoints}) از سقف مجاز (${MAX_CHART_DATA_POINTS}) بیشتر است.`,
      );
    }

    // Pie chart specific invariant: Sum of slices must be > 0
    if (c.type === "pie" && c.series![0]?.data) {
      const sum = c.series![0].data.reduce((acc, p) => acc + (p.value ?? 0), 0);
      if (sum <= 0) {
        errors.push("مجموع مقادیر نمودار دایره‌ای باید بزرگ‌تر از صفر باشد.");
      }
      if (c.series!.length > 1) {
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

export type GroundingVerificationLevel = "table_row_verified" | "numbers_present" | "ungrounded";

export interface DataGroundingResult {
  verified: boolean;
  level: GroundingVerificationLevel;
  ungroundedNumbers: number[];
  tableRowMatches: number;
  totalPoints: number;
  details?: string;
}

/**
 * Deterministically extracts markdown table rows from chunk text.
 * Normalizes digits and trims whitespace.
 */
function extractMarkdownTableRows(text: string): string[][] {
  const lines = text.split("\n");
  const rows: string[][] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) continue;
    // Skip markdown table divider lines (e.g., |---|---| or |:---:|---:|)
    if (/^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed)) continue;
    const cells = trimmed
      .split("|")
      .map((c) =>
        c
          .trim()
          .replace(/[۰-۹٠-٩]/g, (char) => PERSIAN_ARABIC_DIGIT_MAP[char] ?? char)
          .toLowerCase(),
      )
      .filter((c) => c.length > 0);
    if (cells.length >= 2) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * Deterministically verifies if the numerical data points of a data-driven chart
 * are genuinely grounded in the provided source chunks (anti-hallucination guard).
 *
 * Distinguishes between:
 * 1. "table_row_verified": Both x and y coordinates belong to the same markdown table row in the source.
 * 2. "numbers_present": All numbers appear somewhere in the source text, but table row mapping is not provable.
 * 3. "ungrounded": One or more numbers are completely absent from the source text (hallucination).
 */
export function verifyDataPointsAgainstSourceChunks(
  chart: EducationalChart,
  chunks: Array<{ id: string; content: string }>,
): DataGroundingResult {
  if (!chunks || chunks.length === 0) {
    return {
      verified: false,
      level: "ungrounded",
      ungroundedNumbers: [],
      tableRowMatches: 0,
      totalPoints: 0,
      details: "چانک منبعی برای اعتبارسنجی ارائه نشده است.",
    };
  }

  // Convert chunk contents to ASCII for universal digit matching
  const allChunksRawText = chunks.map((c) => c.content).join("\n\n");
  const asciiChunksText = allChunksRawText.replace(
    /[۰-۹٠-٩]/g,
    (char) => PERSIAN_ARABIC_DIGIT_MAP[char] ?? char,
  );

  const tableRows = extractMarkdownTableRows(allChunksRawText);

  const points: ChartDataPoint[] = [];
  if (Array.isArray(chart.series)) {
    for (const s of chart.series) {
      if (Array.isArray(s.data)) points.push(...s.data);
    }
  }
  if (Array.isArray(chart.data)) {
    points.push(...chart.data);
  }

  const ungroundedNumbers: number[] = [];
  let tableRowMatches = 0;

  for (const pt of points) {
    const val = pt.value ?? pt.y;
    if (typeof val === "number" && Number.isFinite(val) && val !== 0) {
      const valStr = String(val);
      if (!asciiChunksText.includes(valStr)) {
        ungroundedNumbers.push(val);
      }
    }
    if (typeof pt.x === "number" && Number.isFinite(pt.x) && pt.x !== 0) {
      const xStr = String(pt.x);
      if (!asciiChunksText.includes(xStr)) {
        ungroundedNumbers.push(pt.x);
      }
    }

    // Check if (x, y) or (label, value) co-occur in any markdown table row
    if (tableRows.length > 0 && typeof val === "number") {
      const valStr = String(val);
      const xStr = pt.x !== undefined ? String(pt.x).toLowerCase() : undefined;
      const labelStr = pt.label ? pt.label.trim().toLowerCase() : undefined;

      const rowMatched = tableRows.some((row) => {
        const hasVal = row.some((cell) => cell === valStr || cell.includes(valStr));
        if (!hasVal) return false;
        if (xStr !== undefined) {
          return row.some((cell) => cell === xStr || cell.includes(xStr));
        }
        if (labelStr !== undefined) {
          return row.some((cell) => cell === labelStr || cell.includes(labelStr));
        }
        return true;
      });

      if (rowMatched) {
        tableRowMatches++;
      }
    }
  }

  const totalPoints = points.length;

  if (ungroundedNumbers.length > 0) {
    return {
      verified: false,
      level: "ungrounded",
      ungroundedNumbers,
      tableRowMatches,
      totalPoints,
      details: "برخی اعداد نمودار در متن منبع یافت نشدند.",
    };
  }

  if (totalPoints > 0 && tableRowMatches === totalPoints) {
    return {
      verified: true,
      level: "table_row_verified",
      ungroundedNumbers: [],
      tableRowMatches,
      totalPoints,
      details: "تمام نقاط داده با ردیف‌های جدول در متن منبع تطبیق داده شدند.",
    };
  }

  const details =
    tableRows.length > 0
      ? "جدول ساختاریافته در منبع شناسایی شد اما تناظر جفت‌داده‌های (x, y) با سطرهای جدول منبع همخوانی کامل ندارد (mapping در سطح سطر جدول اثبات نشده است)."
      : "اعداد نمودار در متن منبع حضور دارند اما ساختار جدولی برای اثبات رابطه جفت‌داده‌ها وجود ندارد.";

  return {
    verified: true,
    level: "numbers_present",
    ungroundedNumbers: [],
    tableRowMatches,
    totalPoints,
    details,
  };
}

export interface LessonChartGateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  charts: EducationalChart[];
}

/**
 * Deterministic Backend Gate validating all educational charts in a generated session
 * against pedagogical intent, density caps, structural validity, and anti-hallucination rules.
 */
export function validateLessonChartGate(
  markdown: string,
  intents: SuggestedVisualization[] = [],
  sourceChunks: Array<{ id: string; content: string }> = [],
): LessonChartGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const charts: EducationalChart[] = [];

  // 0. Approved Intent Density Cap Check (Planner must not exceed MAX_CHARTS_PER_SESSION)
  if (intents.length > MAX_CHARTS_PER_SESSION) {
    errors.push(
      `تعداد مقاصد بصری‌سازی مصوب جلسه (${intents.length}) از سقف مجاز (${MAX_CHARTS_PER_SESSION}) بیشتر است.`,
    );
  }

  if (!markdown || typeof markdown !== "string") {
    return { valid: errors.length === 0, errors, warnings: [], charts: [] };
  }

  // 1. Extract all chart code blocks directly to detect malformed JSON or blocks
  const codeBlockRegex = /```(chart|chart-json|charts)\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const lang = match[1].toLowerCase();
    const rawContent = match[2];
    const parsed = parseChartCodeContent(rawContent, lang);
    if (!parsed) {
      errors.push("کدبلاک نمودار دارای ساختار JSON نامعتبر یا نوع نامشخص است.");
      continue;
    }
    charts.push(parsed);
  }

  // 2. Generated Chart Density Cap Check
  if (charts.length > MAX_CHARTS_PER_SESSION) {
    errors.push(
      `تعداد نمودارهای تولیدشده در جلسه (${charts.length}) از سقف مجاز (${MAX_CHARTS_PER_SESSION}) بیشتر است.`,
    );
  }

  // 3. Fail-fast if chart is generated without intent
  if (intents.length === 0 && charts.length > 0) {
    errors.push(
      `نمودار در جلسه‌ای که فاقد قصد بصری‌سازی (Visualization Intent) مصوب بوده تولید شده است (تعداد نمودار: ${charts.length}).`,
    );
    return { valid: false, errors, warnings, charts };
  }

  // 4. Intent Compatibility & Safety Checks for each chart
  for (let cIdx = 0; cIdx < charts.length; cIdx++) {
    const chart = charts[cIdx];
    const chartNum = cIdx + 1;

    // Find the corresponding intent (or match by type/mode/concept)
    const matchingIntent =
      intents[cIdx] ||
      intents.find((it) => it.type === chart.type && it.mode === chart.mode) ||
      intents[0];

    if (!matchingIntent) {
      errors.push(`نمودار شماره ${chartNum} با هیچ‌یک از مقاصد بصری‌سازی مصوب جلسه مطابقت ندارد.`);
      continue;
    }

    // A. Type compatibility
    if (chart.type !== matchingIntent.type) {
      errors.push(
        `نوع نمودار شماره ${chartNum} ('${chart.type}') با نوع مصوب در طرح درس ('${matchingIntent.type}') مغایرت دارد.`,
      );
    }

    // B. Mode compatibility
    if (matchingIntent.mode === "conceptual") {
      if (chart.mode !== "conceptual") {
        errors.push(
          `نمودار شماره ${chartNum} باید در حالت مفهومی ("mode": "conceptual") باشد، اما '${chart.mode || "data"}' تنظیم شده است.`,
        );
      }

      const intentCanonical = matchCanonicalConceptKey(matchingIntent.concept);
      const chartCanonical = matchCanonicalConceptKey(
        `${chart.title} ${chart.description || ""} ${chart.curves?.map((c) => c.name).join(" ") || ""}`,
      );

      if (intentCanonical) {
        // Known Canonical Concept: strictly requires line chart with sigmoidal parametric curves
        if (chart.type !== "line") {
          errors.push(
            `نمودار مفهومی کانونی شماره ${chartNum} ('${intentCanonical}') باید از نوع خطی (line) باشد.`,
          );
        }

        if (!chart.curves || chart.curves.length === 0) {
          errors.push(
            `نمودار مفهومی کانونی شماره ${chartNum} باید از منحنی‌های پارامتریک (curves) استفاده کند و نباید فاقد منحنی باشد.`,
          );
        } else {
          for (let k = 0; k < chart.curves.length; k++) {
            const curve = chart.curves[k];
            if (curve.parameterSemantics !== "normalized") {
              errors.push(
                `منحنی شماره ${k + 1} در نمودار مفهومی باید دارای parameterSemantics: "normalized" باشد.`,
              );
            }
          }
        }

        // Prohibit empirical fabricated points disguised as series in canonical conceptual chart
        if (chart.series && chart.series.length > 0) {
          errors.push(
            `نمودار مفهومی کانونی شماره ${chartNum} نباید شامل سری داده‌های تجربی گسسته (series) باشد؛ باید از curves استفاده شود.`,
          );
        }

        if (chartCanonical && intentCanonical !== chartCanonical) {
          errors.push(
            `مفهوم نمودار شماره ${chartNum} ('${chartCanonical}') با مفهوم مصوب در طرح درس ('${intentCanonical}') مغایرت مفهومی دارد.`,
          );
        }

        // Canonical Specific Curve Checks
        if (intentCanonical === "competitive_antagonist" && chart.curves && chart.curves.length > 1) {
          const [c1, c2] = chart.curves;
          if (c1.parameters && c2.parameters) {
            if (c1.parameters.emax !== c2.parameters.emax) {
              errors.push(
                `در آنتاگونیسم رقابتی، حداکثر اثر (Emax) باید برای تمام منحنی‌ها ثابت بماند اما متفاوت است (${c1.parameters.emax} در برابر ${c2.parameters.emax}).`,
              );
            }
            if (c2.parameters.logEC50 <= c1.parameters.logEC50) {
              errors.push(
                `در آنتاگونیسم رقابتی، غلظت لازم برای ۵۰٪ پاسخ (EC50) در حضور آنتاگونیست باید افزایش یابد (شیفت به راست).`,
              );
            }
          }
        } else if (intentCanonical === "full_vs_partial_agonist" && chart.curves && chart.curves.length > 1) {
          const [full, partial] = chart.curves;
          if (full.parameters && partial.parameters && partial.parameters.emax >= full.parameters.emax) {
            errors.push(
              `در مقایسه آگونیست کامل و جزئی، کارایی حداکثر (Emax) آگونیست جزئی باید کمتر از آگونیست کامل باشد.`,
            );
          }
        } else if (intentCanonical === "inverse_agonist" && chart.curves) {
          const hasInverseSuppression = chart.curves.some(
            (c) => c.parameters && c.parameters.baseline !== undefined && c.parameters.emax < c.parameters.baseline,
          );
          if (!hasInverseSuppression) {
            errors.push(
              `در مدل آگونیست معکوس، حداقل یک منحنی باید فعالیت گیرنده را به زیر سطح پایه (baseline) کاهش دهد.`,
            );
          }
        }
      } else {
        // Generic Conceptual Chart (e.g., conceptual bar, pie, generic line)
        // Curves are optional; if curves exist, validate parameterSemantics
        if (chart.curves && chart.curves.length > 0) {
          for (let k = 0; k < chart.curves.length; k++) {
            const curve = chart.curves[k];
            if (curve.parameterSemantics !== "normalized") {
              errors.push(
                `منحنی شماره ${k + 1} در نمودار مفهومی باید دارای parameterSemantics: "normalized" باشد.`,
              );
            }
          }
        }
        // Generic conceptual charts can use series or data (e.g. comparative levels)
        // They will be structurally and mathematically validated by validateEducationalChart below.
      }
    } else if (matchingIntent.mode === "data") {
      if (chart.mode !== "data") {
        errors.push(
          `نمودار شماره ${chartNum} باید در حالت داده‌محور ("mode": "data") باشد.`,
        );
      }

      if (!chart.sourceCitation || typeof chart.sourceCitation !== "string" || chart.sourceCitation.trim().length === 0) {
        errors.push(`نمودار داده‌محور شماره ${chartNum} فاقد منبع استناد معتبر (sourceCitation) است.`);
      }

      if (sourceChunks.length > 0) {
        const grounding = verifyDataPointsAgainstSourceChunks(chart, sourceChunks);
        if (!grounding.verified) {
          errors.push(
            `داده‌های عددی نمودار شماره ${chartNum} در متن چانک‌های منبع یافت نشد و فاقد استناد تجربی است (اعداد تأییدنشده: ${grounding.ungroundedNumbers.slice(0, 5).join(", ")}).`,
          );
        } else if (grounding.level === "numbers_present") {
          warnings.push(
            `[نمودار شماره ${chartNum}] داده‌های عددی در متن منبع یافت شدند، اما تناظر جفتی (x, y) در قالب جدول اثبات نشده است (تأیید بر اساس حضور اعداد).`,
          );
        }
      }
    }

    // 5. Standard Invariant Validation
    const val = validateEducationalChart(chart);
    if (!val.valid) {
      errors.push(...val.errors.map((e) => `[نمودار شماره ${chartNum}] ${e}`));
    }
    warnings.push(...val.warnings.map((w) => `[نمودار شماره ${chartNum}] ${w}`));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    charts,
  };
}
