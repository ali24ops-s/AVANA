import React, { useState, useId } from "react";
import type { EducationalChart, ChartSeries, ChartDataPoint, ParametricCurve } from "@avana/domain";
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  ScatterChart as ScatterIcon,
  Info,
  Copy,
  Check,
} from "lucide-react";

export interface ChartBlockProps {
  chart: EducationalChart;
  className?: string;
}

// Canonical AVANA MedTech color palette (strictly controlled by design tokens)
const DEFAULT_PALETTE = [
  "#008080", // AVANA Primary Teal
  "#5ba0c4", // Soft MedTech Blue
  "#2A9D8F", // Persian Green
  "#e07a5f", // Terracotta Coral
  "#8b5cf6", // Clinical Purple
  "#c2853f", // Warm Amber
  "#3d8f6e", // Sage Emerald
];

interface ActiveTooltip {
  x: number;
  y: number;
  title: string;
  items: Array<{ label: string; value: string | number; color?: string }>;
}

export interface SampledCurvePoint {
  x: number;
  y: number;
}

/**
 * Evaluates the sigmoidal Hill equation deterministically.
 * Exponent is clamped to [-12, 12] to prevent numerical overflow/underflow.
 * If x <= 0, returns baseline (safe guard without mutating input).
 */
export const evaluateSigmoidal = (
  x: number,
  emax: number,
  logEC50: number,
  hillSlope = 1,
  baseline = 0,
): number => {
  if (x <= 0) return baseline;
  const logX = Math.log10(x);
  const exponent = Math.max(-12, Math.min(12, hillSlope * (logEC50 - logX)));
  return baseline + (emax - baseline) / (1 + Math.pow(10, exponent));
};

/**
 * Samples exactly sampleCount points (default 60) for a parametric sigmoidal curve.
 * In logarithmic mode, points are distributed evenly across log10 space.
 */
export const sampleSigmoidalCurve = (
  curve: ParametricCurve,
  minX: number,
  maxX: number,
  isLog = true,
  sampleCount = 60,
): SampledCurvePoint[] => {
  const pts: SampledCurvePoint[] = [];
  const { emax, logEC50, hillSlope = 1, baseline = 0 } = curve.parameters;

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    let xVal: number;
    if (isLog) {
      const logMin = Math.log10(minX);
      const logMax = Math.log10(maxX);
      xVal = Math.pow(10, logMin + t * (logMax - logMin));
    } else {
      xVal = minX + t * (maxX - minX);
    }
    const yVal = evaluateSigmoidal(xVal, emax, logEC50, hillSlope, baseline);
    pts.push({ x: xVal, y: yVal });
  }

  return pts;
};

/**
 * Formats a base-10 exponent using Unicode superscripts (e.g. -7 -> 10⁻⁷).
 */
export const formatLog10Exponent = (k: number): string => {
  const superscriptMap: Record<string, string> = {
    "-": "⁻",
    "0": "⁰",
    "1": "¹",
    "2": "²",
    "3": "³",
    "4": "⁴",
    "5": "⁵",
    "6": "⁶",
    "7": "⁷",
    "8": "⁸",
    "9": "⁹",
  };
  const str = k.toString();
  const superStr = str
    .split("")
    .map((ch) => superscriptMap[ch] || ch)
    .join("");
  return `10${superStr}`;
};

export const ChartBlock: React.FC<ChartBlockProps> = ({ chart, className = "" }) => {
  const chartId = useId();
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    type,
    title,
    description,
    xAxis,
    yAxis,
    series = [],
    curves = [],
    unit,
    sourceCitation,
    mode,
  } = chart;

  const handleCopyJson = async () => {
    try {
      const jsonStr = JSON.stringify(chart, null, 2);
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonStr);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = jsonStr;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Gracefully ignore clipboard write errors
    }
  };

  // Chart dimensions inside SVG viewBox
  const vbWidth = 560;
  const vbHeight = 320;
  const margin = { top: 30, right: 35, bottom: 45, left: 45 };
  const plotWidth = vbWidth - margin.left - margin.right;
  const plotHeight = vbHeight - margin.top - margin.bottom;

  // Strict renderer-controlled palette: AI cannot inject uncontrolled or inaccessible colors
  const getSeriesColor = (_s: ChartSeries, idx: number): string => {
    return DEFAULT_PALETTE[idx % DEFAULT_PALETTE.length];
  };

  // Helper: Format numbers for display with full scientific fidelity (no false truncation of decimals)
  const formatNumber = (num: number): string => {
    if (Number.isInteger(num)) return num.toLocaleString("fa-IR");
    return num.toLocaleString("fa-IR", { maximumFractionDigits: 6 });
  };

  const formatUnit = (u?: string) => {
    if (!u) return null;
    return (
      <span dir="ltr" className="inline-block font-sans text-xs text-[var(--color-text-muted)] [unicode-bidi:isolate]">
        ({u})
      </span>
    );
  };

  // --- 1. BAR CHART RENDERER ---
  const renderBarChart = () => {
    if (!series.length) return null;

    // Collect all distinct category labels from all series
    const categories: string[] = [];
    series.forEach((s) => {
      s.data.forEach((pt, i) => {
        const cat = pt.label || (typeof pt.x === "string" ? pt.x : `دسته ${i + 1}`);
        if (!categories.includes(cat)) categories.push(cat);
      });
    });

    if (categories.length === 0) return null;

    // Determine Y range
    let maxY = 0;
    let minY = 0;
    series.forEach((s) => {
      s.data.forEach((pt) => {
        const val = pt.value ?? pt.y ?? 0;
        if (val > maxY) maxY = val;
        if (val < minY) minY = val;
      });
    });

    // Add padding to max
    if (maxY === minY) maxY = maxY > 0 ? maxY * 1.2 : 10;
    else maxY = maxY > 0 ? maxY * 1.15 : 0;
    if (minY > 0) minY = 0; // Baseline at 0 if non-negative

    const yRange = maxY - minY || 1;
    const catWidth = plotWidth / categories.length;
    const seriesCount = series.length;
    const groupPadding = catWidth * 0.2;
    const barSpace = catWidth - groupPadding;
    const barWidth = Math.min(36, Math.max(8, barSpace / seriesCount));

    const zeroY = margin.top + plotHeight - ((0 - minY) / yRange) * plotHeight;

    // Horizontal grid ticks
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => minY + (yRange / tickCount) * i);

    return (
      <g>
        {/* Y-Axis Grid Lines & Ticks */}
        {yTicks.map((tickVal, i) => {
          const yPos = margin.top + plotHeight - ((tickVal - minY) / yRange) * plotHeight;
          return (
            <g key={i} className="text-slate-400 dark:text-slate-600">
              <line
                x1={margin.left}
                y1={yPos}
                x2={margin.left + plotWidth}
                y2={yPos}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "none" : "3,3"}
                opacity={0.35}
              />
              <text
                x={margin.left - 8}
                y={yPos + 4}
                textAnchor="end"
                className="text-[10px] font-sans fill-slate-500 dark:fill-slate-400"
              >
                {formatNumber(tickVal)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {categories.map((cat, catIdx) => {
          const groupLeft = margin.left + catIdx * catWidth + (catWidth - barWidth * seriesCount) / 2;

          return (
            <g key={catIdx}>
              {series.map((s, sIdx) => {
                const pt = s.data.find(
                  (p, i) => (p.label || (typeof p.x === "string" ? p.x : `دسته ${i + 1}`)) === cat,
                );
                const val = pt ? pt.value ?? pt.y ?? 0 : 0;
                const barColor = getSeriesColor(s, sIdx);
                const barHeight = Math.abs((val / yRange) * plotHeight);
                const barX = groupLeft + sIdx * barWidth;
                const barY = val >= 0 ? zeroY - barHeight : zeroY;

                return (
                  <rect
                    key={sIdx}
                    x={barX}
                    y={barY}
                    width={barWidth - 2}
                    height={Math.max(2, barHeight)}
                    rx={3}
                    fill={barColor}
                    className="transition-all duration-200 cursor-pointer hover:opacity-85"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        title: cat,
                        items: [
                          {
                            label: s.name || s.data[0]?.label || "مقدار",
                            value: `${formatNumber(val)} ${yAxis?.unit || unit || ""}`.trim(),
                            color: barColor,
                          },
                        ],
                      });
                    }}
                    onMouseLeave={() => setActiveTooltip(null)}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        title: cat,
                        items: [
                          {
                            label: s.name || s.data[0]?.label || "مقدار",
                            value: `${formatNumber(val)} ${yAxis?.unit || unit || ""}`.trim(),
                            color: barColor,
                          },
                        ],
                      });
                    }}
                  />
                );
              })}

              {/* X Category Label */}
              <text
                x={margin.left + catIdx * catWidth + catWidth / 2}
                y={margin.top + plotHeight + 18}
                textAnchor="middle"
                className="text-[11px] font-sans fill-slate-700 dark:fill-slate-300"
              >
                {cat}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  // --- 2. LINE CHART RENDERER (Scientific Straight Segments & Parametric Curves) ---
  const renderLineChart = () => {
    if (!series.length && !curves.length) return null;

    const isLogX = xAxis?.scale === "log";

    // Collect all points and curve ranges
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;

    // Check if X is numeric across all series
    let isNumericX = true;
    const catLabels: string[] = [];

    if (series.length > 0) {
      series.forEach((s) => {
        s.data.forEach((pt, i) => {
          const yVal = pt.y ?? pt.value ?? 0;
          if (yVal < minY) minY = yVal;
          if (yVal > maxY) maxY = yVal;

          if (typeof pt.x === "number") {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
          } else {
            isNumericX = false;
            const label = pt.label || (typeof pt.x === "string" ? pt.x : `نقطه ${i + 1}`);
            if (!catLabels.includes(label)) catLabels.push(label);
          }
        });
      });
    }

    if (curves.length > 0) {
      curves.forEach((c) => {
        const base = c.parameters.baseline ?? 0;
        const emax = c.parameters.emax;
        const cMin = Math.min(base, emax);
        const cMax = Math.max(base, emax);
        if (cMin < minY) minY = cMin;
        if (cMax > maxY) maxY = cMax;
      });
    }

    // Explicit Y overrides
    if (yAxis?.min !== undefined) minY = yAxis.min;
    if (yAxis?.max !== undefined) maxY = yAxis.max;

    if (minY === Infinity) {
      minY = 0;
      maxY = 10;
    }
    if (yAxis?.min === undefined && minY > 0) {
      minY = 0; // Default baseline at zero for concentration/amounts
    }
    if (yAxis?.max === undefined) {
      if (maxY === minY) {
        maxY = maxY > 0 ? maxY * 1.2 : 10;
      } else if ((unit === "%" || yAxis?.unit === "%") && maxY <= 100 && maxY >= 80) {
        maxY = 100;
      } else {
        maxY *= 1.1;
      }
    }

    const yRange = maxY - minY || 1;

    // X Range computation (Log or Linear)
    let computedMinX = minX;
    let computedMaxX = maxX;

    if (isLogX) {
      if (xAxis?.min !== undefined && xAxis.min > 0 && xAxis?.max !== undefined && xAxis.max > xAxis.min) {
        computedMinX = xAxis.min;
        computedMaxX = xAxis.max;
      } else if (curves.length > 0) {
        const logEC50Vals = curves.map((c) => c.parameters.logEC50);
        const minLog = Math.min(...logEC50Vals);
        const maxLog = Math.max(...logEC50Vals);
        computedMinX = Math.pow(10, Math.floor(minLog - 2.5));
        computedMaxX = Math.pow(10, Math.ceil(maxLog + 2.5));
      } else {
        let sMin = Infinity;
        let sMax = -Infinity;
        series.forEach((s) => {
          s.data.forEach((pt) => {
            if (typeof pt.x === "number" && pt.x > 0) {
              if (pt.x < sMin) sMin = pt.x;
              if (pt.x > sMax) sMax = pt.x;
            }
          });
        });
        if (sMin === Infinity) {
          computedMinX = 1e-10;
          computedMaxX = 1e-4;
        } else {
          computedMinX = Math.pow(10, Math.floor(Math.log10(sMin)));
          computedMaxX = Math.pow(10, Math.ceil(Math.log10(sMax)));
          if (computedMinX === computedMaxX) {
            computedMinX = computedMinX / 10;
            computedMaxX = computedMaxX * 10;
          }
        }
      }
    } else {
      if (xAxis?.min !== undefined) computedMinX = xAxis.min;
      if (xAxis?.max !== undefined) computedMaxX = xAxis.max;
      if (computedMinX === Infinity) {
        computedMinX = 0;
        computedMaxX = 10;
      }
    }

    // X scale helper
    const getXCoord = (pt: ChartDataPoint, idx: number): number => {
      if (isLogX) {
        const xVal = typeof pt.x === "number" ? pt.x : 0;
        if (xVal <= 0) return margin.left;
        const logMin = Math.log10(computedMinX);
        const logMax = Math.log10(computedMaxX);
        return margin.left + ((Math.log10(xVal) - logMin) / (logMax - logMin || 1)) * plotWidth;
      }
      if (isNumericX && computedMinX !== Infinity && computedMaxX !== computedMinX) {
        const xVal = typeof pt.x === "number" ? pt.x : idx;
        return margin.left + ((xVal - computedMinX) / (computedMaxX - computedMinX)) * plotWidth;
      }
      const total = catLabels.length > 1 ? catLabels.length - 1 : 1;
      return margin.left + (idx / total) * plotWidth;
    };

    // Y scale helper
    const getYCoord = (val: number): number => {
      return margin.top + plotHeight - ((val - minY) / yRange) * plotHeight;
    };

    // Y Grid Ticks
    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => minY + (yRange / tickCount) * i);

    // Log Ticks
    const logMin = isLogX ? Math.round(Math.log10(computedMinX)) : 0;
    const logMax = isLogX ? Math.round(Math.log10(computedMaxX)) : 0;
    const totalDecades = logMax - logMin;
    const step = totalDecades > 7 ? 2 : 1;
    const logTicks: number[] = [];
    if (isLogX) {
      for (let k = logMin; k <= logMax; k += step) {
        logTicks.push(k);
      }
    }

    return (
      <g>
        {/* Y Grid */}
        {yTicks.map((tickVal, i) => {
          const yPos = getYCoord(tickVal);
          return (
            <g key={i} className="text-slate-400 dark:text-slate-600">
              <line
                x1={margin.left}
                y1={yPos}
                x2={margin.left + plotWidth}
                y2={yPos}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "none" : "3,3"}
                opacity={0.35}
              />
              <text
                x={margin.left - 8}
                y={yPos + 4}
                textAnchor="end"
                className="text-[10px] font-sans fill-slate-500 dark:fill-slate-400"
              >
                {formatNumber(tickVal)}
              </text>
            </g>
          );
        })}

        {/* X Grid & Ticks (Categorical, Numeric Linear, or Logarithmic) */}
        {!isLogX &&
          !isNumericX &&
          catLabels.map((lbl, idx) => {
            const total = catLabels.length > 1 ? catLabels.length - 1 : 1;
            const xPos = margin.left + (idx / total) * plotWidth;
            return (
              <text
                key={idx}
                x={xPos}
                y={margin.top + plotHeight + 18}
                textAnchor="middle"
                className="text-[10px] font-sans fill-slate-600 dark:fill-slate-400"
              >
                {lbl}
              </text>
            );
          })}

        {!isLogX &&
          isNumericX &&
          [
            computedMinX,
            computedMinX + (computedMaxX - computedMinX) * 0.25,
            computedMinX + (computedMaxX - computedMinX) * 0.5,
            computedMinX + (computedMaxX - computedMinX) * 0.75,
            computedMaxX,
          ].map((val, idx) => {
            const xPos = margin.left + ((val - computedMinX) / (computedMaxX - computedMinX || 1)) * plotWidth;
            return (
              <text
                key={idx}
                x={xPos}
                y={margin.top + plotHeight + 18}
                textAnchor="middle"
                className="text-[10px] font-sans fill-slate-600 dark:fill-slate-400"
              >
                {formatNumber(val)}
              </text>
            );
          })}

        {isLogX &&
          logTicks.map((k) => {
            const curLogMin = Math.log10(computedMinX);
            const curLogMax = Math.log10(computedMaxX);
            const xPos = margin.left + ((k - curLogMin) / (curLogMax - curLogMin || 1)) * plotWidth;
            return (
              <g key={`log-tick-${k}`}>
                <line
                  x1={xPos}
                  y1={margin.top}
                  x2={xPos}
                  y2={margin.top + plotHeight}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                  opacity={0.2}
                  className="text-slate-400 dark:text-slate-600"
                />
                <text
                  x={xPos}
                  y={margin.top + plotHeight + 18}
                  textAnchor="middle"
                  className="text-[10px] font-sans fill-slate-600 dark:fill-slate-400"
                >
                  {formatLog10Exponent(k)}
                </text>
              </g>
            );
          })}

        {/* Parametric Curves */}
        {curves.map((c, cIdx) => {
          const curveColor = c.color || DEFAULT_PALETTE[(series.length + cIdx) % DEFAULT_PALETTE.length];
          const pts = sampleSigmoidalCurve(
            c,
            isLogX ? computedMinX : computedMinX,
            isLogX ? computedMaxX : computedMaxX,
            isLogX,
            60,
          );

          const dPath = pts
            .map((pt, i) => {
              const screenX = isLogX
                ? margin.left +
                  ((Math.log10(pt.x) - Math.log10(computedMinX)) /
                    (Math.log10(computedMaxX) - Math.log10(computedMinX) || 1)) *
                    plotWidth
                : margin.left + ((pt.x - computedMinX) / (computedMaxX - computedMinX || 1)) * plotWidth;
              const screenY = margin.top + plotHeight - ((pt.y - minY) / yRange) * plotHeight;
              return `${i === 0 ? "M" : "L"} ${screenX.toFixed(2)} ${screenY.toFixed(2)}`;
            })
            .join(" ");

          return (
            <g key={`curve-${cIdx}`} data-testid={`chart-curve-${cIdx}`}>
              <path
                d={dPath}
                fill="none"
                stroke={curveColor}
                strokeWidth={2.5}
                strokeDasharray={c.lineStyle === "dashed" ? "6,4" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="cursor-pointer transition-opacity duration-150 hover:opacity-80"
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setActiveTooltip({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,
                    title: c.name,
                    items: [
                      {
                        label: "Emax",
                        value: `${formatNumber(c.parameters.emax)} ${yAxis?.unit || unit || ""}`.trim(),
                        color: curveColor,
                      },
                      {
                        label: "logEC50",
                        value: formatNumber(c.parameters.logEC50),
                      },
                      ...(c.parameters.hillSlope && c.parameters.hillSlope !== 1
                        ? [{ label: "Hill Slope", value: formatNumber(c.parameters.hillSlope) }]
                        : []),
                    ],
                  });
                }}
                onMouseLeave={() => setActiveTooltip(null)}
              />
            </g>
          );
        })}

        {/* Series Lines & Dots */}
        {series.map((s, sIdx) => {
          const color = getSeriesColor(s, sIdx);
          if (s.data.length === 0) return null;

          // Defensive guard for log scale: safely omit non-positive x without mutating original data
          const validData = isLogX
            ? s.data.filter((pt) => typeof pt.x === "number" && pt.x > 0)
            : s.data;

          if (validData.length === 0) return null;

          // Scientific straight lines between points
          const pathPoints = validData.map((pt, i) => {
            const xPos = getXCoord(pt, i);
            const yVal = pt.y ?? pt.value ?? 0;
            const yPos = getYCoord(yVal);
            return `${i === 0 ? "M" : "L"} ${xPos} ${yPos}`;
          });

          const dPath = pathPoints.join(" ");

          return (
            <g key={sIdx}>
              {/* Line path */}
              <path
                d={dPath}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data marker dots */}
              {validData.map((pt, ptIdx) => {
                const xPos = getXCoord(pt, ptIdx);
                const yVal = pt.y ?? pt.value ?? 0;
                const yPos = getYCoord(yVal);
                const label = pt.label || (typeof pt.x === "string" ? pt.x : `نقطه ${ptIdx + 1}`);

                return (
                  <circle
                    key={ptIdx}
                    cx={xPos}
                    cy={yPos}
                    r={4}
                    fill="#FFFFFF"
                    stroke={color}
                    strokeWidth={2.5}
                    className="cursor-pointer transition-transform duration-150 hover:scale-150"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        title: s.name ? `${s.name} - ${label}` : label,
                        items: [
                          {
                            label: yAxis?.label || "مقدار",
                            value: `${formatNumber(yVal)} ${yAxis?.unit || unit || ""}`.trim(),
                            color,
                          },
                          ...(typeof pt.x === "number"
                            ? [
                                {
                                  label: xAxis?.label || "مقدار افقی",
                                  value: `${formatNumber(pt.x)} ${xAxis?.unit || ""}`.trim(),
                                },
                              ]
                            : []),
                        ],
                      });
                    }}
                    onMouseLeave={() => setActiveTooltip(null)}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        title: s.name ? `${s.name} - ${label}` : label,
                        items: [
                          {
                            label: yAxis?.label || "مقدار",
                            value: `${formatNumber(yVal)} ${yAxis?.unit || unit || ""}`.trim(),
                            color,
                          },
                        ],
                      });
                    }}
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    );
  };

  // --- 3. PIE CHART RENDERER (Donut / Pie Sectors) ---
  const renderPieChart = () => {
    const rawData = series[0]?.data || [];
    if (rawData.length === 0) return null;

    const total = rawData.reduce((acc, p) => acc + (p.value ?? p.y ?? 0), 0);
    if (total <= 0) return null;

    const cx = vbWidth / 2;
    const cy = vbHeight / 2 - 10;
    const radius = Math.min(plotWidth, plotHeight) / 2.3;
    const innerRadius = radius * 0.45; // Modern accessible donut hole

    let currentAngle = -Math.PI / 2; // Start from top 12 o'clock

    return (
      <g>
        {rawData.map((pt, i) => {
          const val = pt.value ?? pt.y ?? 0;
          const sliceAngle = (val / total) * (Math.PI * 2);
          const endAngle = currentAngle + sliceAngle;
          const sliceColor = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];

          const x1 = cx + radius * Math.cos(currentAngle);
          const y1 = cy + radius * Math.sin(currentAngle);
          const x2 = cx + radius * Math.cos(endAngle);
          const y2 = cy + radius * Math.sin(endAngle);

          const ix1 = cx + innerRadius * Math.cos(endAngle);
          const iy1 = cy + innerRadius * Math.sin(endAngle);
          const ix2 = cx + innerRadius * Math.cos(currentAngle);
          const iy2 = cy + innerRadius * Math.sin(currentAngle);

          const largeArc = sliceAngle > Math.PI ? 1 : 0;
          const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

          const pct = Math.round((val / total) * 100);
          const label = pt.label || `بخش ${i + 1}`;

          currentAngle = endAngle;

          return (
            <path
              key={i}
              d={d}
              fill={sliceColor}
              stroke="currentColor"
              strokeWidth={1.5}
              className="cursor-pointer transition-opacity duration-150 hover:opacity-80 text-white dark:text-slate-900"
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setActiveTooltip({
                  x: rect.left + rect.width / 2,
                  y: rect.top - 8,
                  title: label,
                  items: [
                    {
                      label: "سهم",
                      value: `${formatNumber(val)} ${unit || ""}`.trim(),
                      color: sliceColor,
                    },
                    {
                      label: "درصد",
                      value: `${formatNumber(pct)}%`,
                    },
                  ],
                });
              }}
              onMouseLeave={() => setActiveTooltip(null)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setActiveTooltip({
                  x: rect.left + rect.width / 2,
                  y: rect.top - 8,
                  title: label,
                  items: [
                    {
                      label: "سهم",
                      value: `${formatNumber(val)} ${unit || ""}`.trim(),
                      color: sliceColor,
                    },
                    {
                      label: "درصد",
                      value: `${formatNumber(pct)}%`,
                    },
                  ],
                });
              }}
            />
          );
        })}
      </g>
    );
  };

  // --- 4. SCATTER PLOT RENDERER ---
  const renderScatterPlot = () => {
    if (!series.length) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    series.forEach((s) => {
      s.data.forEach((pt) => {
        const x = typeof pt.x === "number" ? pt.x : 0;
        const y = pt.y ?? pt.value ?? 0;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      });
    });

    if (minX === Infinity) {
      minX = 0;
      maxX = 10;
      minY = 0;
      maxY = 10;
    }

    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const padX = spanX * 0.08;
    const padY = spanY * 0.08;

    const computedMinX = minX >= 0 && minX < spanX * 0.5 ? 0 : Math.max(minX < 0 ? minX - padX : 0, minX - padX);
    const computedMaxX = maxX + padX;
    const computedMinY = minY >= 0 && minY < spanY * 0.5 ? 0 : Math.max(minY < 0 ? minY - padY : 0, minY - padY);
    const computedMaxY = maxY + padY;

    const xRange = computedMaxX - computedMinX || 1;
    const yRange = computedMaxY - computedMinY || 1;

    const getXCoord = (x: number) => margin.left + ((x - computedMinX) / xRange) * plotWidth;
    const getYCoord = (y: number) => margin.top + plotHeight - ((y - computedMinY) / yRange) * plotHeight;

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => computedMinY + (yRange / tickCount) * i);
    const xTicks = Array.from({ length: tickCount + 1 }, (_, i) => computedMinX + (xRange / tickCount) * i);

    return (
      <g>
        {/* Y-Grid */}
        {yTicks.map((tickVal, i) => {
          const yPos = getYCoord(tickVal);
          return (
            <g key={i} className="text-slate-400 dark:text-slate-600">
              <line
                x1={margin.left}
                y1={yPos}
                x2={margin.left + plotWidth}
                y2={yPos}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray={i === 0 ? "none" : "3,3"}
                opacity={0.35}
              />
              <text
                x={margin.left - 8}
                y={yPos + 4}
                textAnchor="end"
                className="text-[10px] font-sans fill-slate-500 dark:fill-slate-400"
              >
                {formatNumber(tickVal)}
              </text>
            </g>
          );
        })}

        {/* X-Grid */}
        {xTicks.map((tickVal, i) => {
          const xPos = getXCoord(tickVal);
          return (
            <g key={i}>
              <line
                x1={xPos}
                y1={margin.top}
                x2={xPos}
                y2={margin.top + plotHeight}
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="3,3"
                opacity={0.25}
                className="text-slate-400 dark:text-slate-600"
              />
              <text
                x={xPos}
                y={margin.top + plotHeight + 18}
                textAnchor="middle"
                className="text-[10px] font-sans fill-slate-600 dark:fill-slate-400"
              >
                {formatNumber(tickVal)}
              </text>
            </g>
          );
        })}

        {/* Scatter Points */}
        {series.map((s, sIdx) => {
          const color = getSeriesColor(s, sIdx);
          return (
            <g key={sIdx}>
              {s.data.map((pt, ptIdx) => {
                const xVal = typeof pt.x === "number" ? pt.x : 0;
                const yVal = pt.y ?? pt.value ?? 0;
                const xPos = getXCoord(xVal);
                const yPos = getYCoord(yVal);
                const ptLabel = pt.label || `نقطه ${ptIdx + 1}`;

                return (
                  <circle
                    key={ptIdx}
                    cx={xPos}
                    cy={yPos}
                    r={5}
                    fill={color}
                    fillOpacity={0.8}
                    stroke="currentColor"
                    strokeWidth={1.5}
                    className="cursor-pointer transition-transform duration-150 hover:scale-150 text-white dark:text-slate-900"
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        title: s.name ? `${s.name} (${ptLabel})` : ptLabel,
                        items: [
                          {
                            label: xAxis?.label || "X",
                            value: `${formatNumber(xVal)} ${xAxis?.unit || ""}`.trim(),
                            color,
                          },
                          {
                            label: yAxis?.label || "Y",
                            value: `${formatNumber(yVal)} ${yAxis?.unit || ""}`.trim(),
                            color,
                          },
                        ],
                      });
                    }}
                    onMouseLeave={() => setActiveTooltip(null)}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setActiveTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8,
                        title: s.name ? `${s.name} (${ptLabel})` : ptLabel,
                        items: [
                          {
                            label: xAxis?.label || "X",
                            value: `${formatNumber(xVal)} ${xAxis?.unit || ""}`.trim(),
                            color,
                          },
                          {
                            label: yAxis?.label || "Y",
                            value: `${formatNumber(yVal)} ${yAxis?.unit || ""}`.trim(),
                            color,
                          },
                        ],
                      });
                    }}
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    );
  };

  const getHeaderIcon = () => {
    switch (type) {
      case "bar":
        return <BarChart3 className="w-4 h-4 text-[#008080] dark:text-teal-400" />;
      case "line":
        return <LineChartIcon className="w-4 h-4 text-[#008080] dark:text-teal-400" />;
      case "pie":
        return <PieChartIcon className="w-4 h-4 text-[#008080] dark:text-teal-400" />;
      case "scatter":
        return <ScatterIcon className="w-4 h-4 text-[#008080] dark:text-teal-400" />;
    }
  };

  return (
    <div
      className={`my-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-6 shadow-xs select-none max-w-full overflow-hidden ${className}`.trim()}
      dir="rtl"
      data-testid="chart-block"
      data-chart-type={type}
    >
      {/* Chart Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200/60 dark:border-teal-800/40 shrink-0">
              {getHeaderIcon()}
            </span>
            <h4 className="text-base sm:text-lg font-bold text-[var(--color-text)] break-words">
              {title}
            </h4>
          </div>
          {description && (
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1.5 leading-relaxed break-words">
              {description}
            </p>
          )}
        </div>

        {/* Toolbar & Badges */}
        <div className="flex items-center gap-2 shrink-0">
          {mode === "conceptual" && (
            <span
              className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200/70 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/60 select-none"
              data-testid="conceptual-badge"
            >
              نمایش مفهومی / شماتیک
            </span>
          )}
          {(xAxis?.unit || yAxis?.unit || unit) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              {yAxis?.unit && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
                  محور عمودی: {formatUnit(yAxis.unit)}
                </span>
              )}
              {xAxis?.unit && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
                  محور افقی: {formatUnit(xAxis.unit)}
                </span>
              )}
              {unit && !yAxis?.unit && !xAxis?.unit && (
                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60">
                  واحد: {formatUnit(unit)}
                </span>
              )}
            </div>
          )}

          {/* Copy JSON Button */}
          <button
            type="button"
            onClick={handleCopyJson}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer border border-slate-200/80 dark:border-slate-700/60"
            title={copied ? "کپی شد!" : "کپی داده‌های نمودار (JSON)"}
            aria-label="کپی داده‌های نمودار"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">کپی شد</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px]">کپی JSON</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full max-w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${vbWidth} ${vbHeight}`}
          className="w-full h-auto max-h-[380px] overflow-visible"
          role="img"
          aria-label={title}
          id={chartId}
        >
          {type === "bar" && renderBarChart()}
          {type === "line" && renderLineChart()}
          {type === "pie" && renderPieChart()}
          {type === "scatter" && renderScatterPlot()}
        </svg>

        {/* Floating Tooltip */}
        {activeTooltip && (
          <div
            className="fixed z-50 pointer-events-none -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-lg bg-slate-900/95 text-white text-xs shadow-lg border border-slate-700 backdrop-blur-xs font-sans max-w-[200px]"
            style={{
              left: `${typeof window !== "undefined" ? Math.max(105, Math.min(window.innerWidth - 105, activeTooltip.x)) : activeTooltip.x}px`,
              top: `${activeTooltip.y}px`,
            }}
            dir="rtl"
            data-testid="chart-tooltip"
          >
            <div className="font-bold border-b border-slate-700 pb-1 mb-1 truncate">
              {activeTooltip.title}
            </div>
            <div className="space-y-0.5">
              {activeTooltip.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    {item.color && (
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                    )}
                    {item.label}:
                  </span>
                  <span className="font-semibold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend Area (if multiple series/curves, pie chart, or named single series/curve) */}
      {(series.length + curves.length > 1 ||
        type === "pie" ||
        (series.length === 1 && Boolean(series[0]?.name)) ||
        (curves.length === 1 && Boolean(curves[0]?.name))) && (
        <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex flex-wrap items-center justify-center gap-4 text-xs font-sans">
          {type === "pie"
            ? (series[0]?.data || []).map((pt, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[var(--color-text)]">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: DEFAULT_PALETTE[i % DEFAULT_PALETTE.length] }}
                  />
                  <span dir="auto" className="[unicode-bidi:isolate]">{pt.label || `بخش ${i + 1}`}</span>
                </div>
              ))
            : (
                <>
                  {series.map((s, i) => (
                    <div key={`series-${i}`} className="flex items-center gap-1.5 text-[var(--color-text)]">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: getSeriesColor(s, i) }}
                      />
                      <span dir="auto" className="[unicode-bidi:isolate]">{s.name || `سری ${i + 1}`}</span>
                    </div>
                  ))}
                  {curves.map((c, i) => {
                    const curveColor = c.color || DEFAULT_PALETTE[(series.length + i) % DEFAULT_PALETTE.length];
                    return (
                      <div key={`curve-legend-${i}`} className="flex items-center gap-1.5 text-[var(--color-text)]">
                        {c.lineStyle === "dashed" ? (
                          <span
                            className="w-3.5 h-0 border-t-2 border-dashed shrink-0"
                            style={{ borderColor: curveColor }}
                          />
                        ) : (
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: curveColor }}
                          />
                        )}
                        <span dir="auto" className="[unicode-bidi:isolate]">{c.name || `منحنی ${i + 1}`}</span>
                      </div>
                    );
                  })}
                </>
              )}
        </div>
      )}

      {/* Provenance Citation Footer (if provided) */}
      {sourceCitation && (
        <div className="mt-3 pt-2 text-[10px] text-[var(--color-text-muted)] flex items-center gap-1">
          <Info className="w-3 h-3 text-slate-400 shrink-0" />
          <span>منبع داده: {sourceCitation}</span>
        </div>
      )}
    </div>
  );
};
