/**
 * ChemicalStructureBlock — Real 2D Vector Molecular Structure Renderer for AVANA.
 *
 * Capabilities:
 * - Deterministic vector SVG rendering from SMILES strings using SmilesDrawer
 * - Isolated LTR container for chemical graph coordinates with RTL Persian educational metadata
 * - Dual Light/Dark mode reactive palette integration
 * - Validation alert display when needsReview is true
 * - SAR (Structure-Activity Relationship) pedagogical callout display
 * - Zero dependency on remote image services (pure local, offline, deterministic)
 */

import React, { useEffect, useRef, useState, useId } from "react";
import {
  type ChemicalStructure,
  validateChemicalStructure,
  toPersianDigits,
} from "@avana/domain";
import { FlaskConical, AlertTriangle, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";

export interface ChemicalStructureBlockProps {
  structure: ChemicalStructure;
  className?: string;
  width?: number;
  height?: number;
  showSarHighlights?: boolean;
}

interface SvgDrawerInstance {
  draw: (
    data: unknown,
    target: SVGSVGElement | null,
    themeName?: string,
    weights?: unknown,
    infoOnly?: boolean,
  ) => SVGSVGElement;
}

interface SvgDrawerConstructor {
  new (options: Record<string, unknown>): SvgDrawerInstance;
}

interface SmilesDrawerModule {
  SvgDrawer: SvgDrawerConstructor;
  parse: (
    smiles: string,
    successCallback: (tree: unknown) => void,
    errorCallback: (err: Error) => void,
  ) => void;
}

let cachedSmilesDrawer: SmilesDrawerModule | null = null;
let loadPromise: Promise<SmilesDrawerModule> | null = null;

async function getSmilesDrawer(): Promise<SmilesDrawerModule> {
  if (cachedSmilesDrawer) {
    return cachedSmilesDrawer;
  }
  if (!loadPromise) {
    loadPromise = import("smiles-drawer").then((mod) => {
      const resolved = (
        mod.default && (mod.default as unknown as { SvgDrawer?: unknown }).SvgDrawer
          ? mod.default
          : mod
      ) as unknown as SmilesDrawerModule;
      cachedSmilesDrawer = resolved;
      return resolved;
    });
  }
  return loadPromise;
}

function fitSvgViewBox(
  svg: SVGSVGElement,
  defaultWidth: number,
  defaultHeight: number,
  padding = 16,
) {
  try {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let foundCoords = false;

    // 1. Try native getBBox() if supported and non-empty
    if (typeof svg.getBBox === "function") {
      const bbox = svg.getBBox();
      if (bbox && (bbox.width > 0 || bbox.height > 0)) {
        minX = bbox.x;
        minY = bbox.y;
        maxX = bbox.x + bbox.width;
        maxY = bbox.y + bbox.height;
        foundCoords = true;
      }
    }

    // 2. Fallback / DOM inspection: Parse element attributes (useful in jsdom or if getBBox is zero)
    if (!foundCoords) {
      const elements = svg.querySelectorAll("line, text, circle, polygon, path, rect");
      elements.forEach((el) => {
        const tagName = el.tagName.toLowerCase();
        if (tagName === "line") {
          const x1 = parseFloat(el.getAttribute("x1") || "0");
          const y1 = parseFloat(el.getAttribute("y1") || "0");
          const x2 = parseFloat(el.getAttribute("x2") || "0");
          const y2 = parseFloat(el.getAttribute("y2") || "0");
          if (!isNaN(x1) && !isNaN(y1)) {
            minX = Math.min(minX, x1, x2);
            maxX = Math.max(maxX, x1, x2);
            minY = Math.min(minY, y1, y2);
            maxY = Math.max(maxY, y1, y2);
            foundCoords = true;
          }
        } else if (tagName === "text" || tagName === "circle") {
          const x = parseFloat(el.getAttribute("x") || el.getAttribute("cx") || "0");
          const y = parseFloat(el.getAttribute("y") || el.getAttribute("cy") || "0");
          if (!isNaN(x) && !isNaN(y)) {
            minX = Math.min(minX, x - 10);
            maxX = Math.max(maxX, x + 10);
            minY = Math.min(minY, y - 10);
            maxY = Math.max(maxY, y + 10);
            foundCoords = true;
          }
        } else if (tagName === "polygon") {
          const points = (el.getAttribute("points") || "").trim().split(/[\s,]+/);
          for (let i = 0; i < points.length; i += 2) {
            const px = parseFloat(points[i]);
            const py = parseFloat(points[i + 1]);
            if (!isNaN(px) && !isNaN(py)) {
              minX = Math.min(minX, px);
              maxX = Math.max(maxX, px);
              minY = Math.min(minY, py);
              maxY = Math.max(maxY, py);
              foundCoords = true;
            }
          }
        }
      });
    }

    if (foundCoords && isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
      const w = Math.max(maxX - minX, 20);
      const h = Math.max(maxY - minY, 20);
      const vx = minX - padding;
      const vy = minY - padding;
      const vw = w + padding * 2;
      const vh = h + padding * 2;
      svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
    } else {
      svg.setAttribute("viewBox", `0 0 ${defaultWidth} ${defaultHeight}`);
    }
  } catch {
    svg.setAttribute("viewBox", `0 0 ${defaultWidth} ${defaultHeight}`);
  }
}

export function ChemicalStructureBlock({
  structure,
  className = "",
  width = 800,
  height = 400,
  showSarHighlights = true,
}: ChemicalStructureBlockProps) {
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const uniqueId = useId().replace(/:/g, "_");

  // Validate structure using domain chemical validator
  const validation = React.useMemo(() => {
    return validateChemicalStructure(structure);
  }, [structure]);

  // Render SMILES to SVG via SmilesDrawer
  useEffect(() => {
    let isMounted = true;
    const container = svgContainerRef.current;
    if (!container || !structure.smiles || structure.smiles.trim().length === 0) {
      return;
    }

    try {
      // Clear previous SVG content
      container.innerHTML = "";
      setRenderError(null);

      const targetSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      targetSvg.setAttribute("id", `chem_svg_${uniqueId}`);
      targetSvg.setAttribute("width", "100%");
      targetSvg.setAttribute("height", "100%");
      targetSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      targetSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      targetSvg.classList.add("w-full", "h-auto");
      container.appendChild(targetSvg);

      // SmilesDrawer configuration with adaptive theme
      const isDarkMode =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");

      const drawerOptions = {
        width,
        height,
        bondThickness: 1.8,
        bondLength: 22.5,
        shortBondLength: 0.85,
        bondSpacing: 0.18 * 22.5,
        atomVisualization: "default",
        isomeric: true,
        compactDrawing: false,
        fontSizeLarge: 11,
        fontSizeSmall: 8,
        padding: 16,
        themes: {
          light: {
            C: "#1e293b",
            O: "#e11d48",
            N: "#2563eb",
            F: "#059669",
            CL: "#16a34a",
            BR: "#9333ea",
            I: "#7c2d12",
            P: "#ea580c",
            S: "#d97706",
            B: "#0284c7",
            SI: "#475569",
            H: "#64748b",
            BACKGROUND: "transparent",
          },
          dark: {
            C: "#f1f5f9",
            O: "#fb7185",
            N: "#60a5fa",
            F: "#34d399",
            CL: "#4ade80",
            BR: "#c084fc",
            I: "#fdba74",
            P: "#fb923c",
            S: "#facc15",
            B: "#38bdf8",
            SI: "#94a3b8",
            H: "#94a3b8",
            BACKGROUND: "transparent",
          },
        },
      };

      getSmilesDrawer()
        .then((smilesDrawer) => {
          if (!isMounted) return;
          const SvgDrawerClass = smilesDrawer.SvgDrawer;
          const svgDrawer = new SvgDrawerClass(drawerOptions);

          smilesDrawer.parse(
            structure.smiles.trim(),
            (parseTree: unknown) => {
              if (!isMounted) return;
              try {
                svgDrawer.draw(
                  parseTree,
                  targetSvg,
                  isDarkMode ? "dark" : "light",
                  false,
                );
                fitSvgViewBox(targetSvg, width, height, 16);
              } catch (drawErr) {
                if (isMounted) {
                  setRenderError(
                    drawErr instanceof Error ? drawErr.message : "خطا در ترسیم گراف ساختار",
                  );
                }
              }
            },
            (parseErr: Error) => {
              if (!isMounted) return;
              setRenderError(parseErr?.message || "خطا در پردازش کد SMILES");
            },
          );
        })
        .catch((loadErr) => {
          if (!isMounted) return;
          setRenderError(
            loadErr instanceof Error
              ? `خطا در بارگذاری ماژول رسم شیمیایی: ${loadErr.message}`
              : "خطا در بارگذاری ماژول رسم شیمیایی",
          );
        });
    } catch (err) {
      if (isMounted) {
        setRenderError(err instanceof Error ? err.message : "خطای ناشناخته در رندر شیمیایی");
      }
    }

    return () => {
      isMounted = false;
    };
  }, [structure.smiles, width, height, uniqueId]);

  return (
    <div
      className={`my-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs overflow-hidden transition-all text-right ${className}`.trim()}
      dir="rtl"
      data-testid="chemical-structure-block"
      data-compound-id={structure.id || structure.compoundName}
    >
      {/* 1. Header with Compound Name & Drug Class */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-text)] truncate">
                {structure.compoundName}
              </span>
              {structure.drugClass && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-[var(--color-text-secondary)] font-medium shrink-0">
                  {structure.drugClass}
                </span>
              )}
            </div>
            {structure.iupacName && (
              <p className="text-[11px] text-[var(--color-text-muted)] font-mono truncate" dir="ltr">
                {structure.iupacName}
              </p>
            )}
          </div>
        </div>

        {/* Validation / Review Status Badge */}
        {validation.needsReview ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-bold"
            title={validation.warnings.join("\n") || "نیازمند بازبینی اطلاعات ساختار"}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>نیازمند بازبینی علمی</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>تأیید ساختار</span>
          </div>
        )}
      </div>

      {/* 2. Main 2D Vector Structure Viewport (Isolated LTR) */}
      <div className="py-1 px-4 sm:py-1.5 sm:px-6 flex flex-col items-center justify-center bg-white dark:bg-slate-950/60 relative">
        {renderError ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5 max-w-md text-center">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>عدم امکان ترسیم مولکول: {renderError}</span>
          </div>
        ) : (
          <div
            ref={svgContainerRef}
            className="w-full max-w-[580px] flex items-center justify-center [unicode-bidi:isolate]"
            dir="ltr"
          />
        )}
      </div>

      {/* 3. Chemical Metadata & Formula Bar */}
      <div className="px-5 py-3 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          {structure.formula && (
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--color-text-muted)]">فرمول مولکولی:</span>
              <span className="font-mono font-bold text-[var(--color-text)] tracking-wider" dir="ltr">
                {structure.formula}
              </span>
            </div>
          )}

          {typeof structure.molecularWeight === "number" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--color-text-muted)]">وزن مولکولی:</span>
              <span className="font-mono font-semibold text-[var(--color-text)]" dir="ltr">
                {toPersianDigits(structure.molecularWeight.toFixed(2))} g/mol
              </span>
            </div>
          )}
        </div>

        {/* SMILES Code String Tooltip/Badge */}
        <div
          className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded border border-slate-200/80 dark:border-slate-700/60 max-w-[220px] truncate"
          dir="ltr"
          title={`SMILES: ${structure.smiles}`}
        >
          {structure.smiles}
        </div>
      </div>

      {/* 4. SAR (Structure-Activity Relationship) Pedagogical Callout */}
      {showSarHighlights &&
        Array.isArray(structure.sarHighlights) &&
        structure.sarHighlights.length > 0 && (
          <div className="px-5 py-3.5 bg-teal-500/5 dark:bg-teal-950/20 border-t border-teal-500/20 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>نکات ساختار-فعالیت (SAR - Structure-Activity Relationship):</span>
            </div>
            <ul className="space-y-1.5 text-xs text-[var(--color-text)] ps-4 list-disc">
              {structure.sarHighlights.map((sar, sIdx) => (
                <li key={sIdx} className="leading-relaxed">
                  <strong className="text-teal-800 dark:text-teal-200">{sar.feature}:</strong>{" "}
                  <span className="text-[var(--color-text-secondary)]">{sar.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}
