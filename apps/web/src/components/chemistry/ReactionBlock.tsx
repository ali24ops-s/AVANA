/**
 * ReactionBlock — High-Density 2D Vector Organic Chemistry Reaction Renderer for AVANA.
 *
 * ChemDraw-like 2D Reaction Scheme Renderer:
 * - Real 2D molecular structures with uniform bond lengths (20px) and proportional scaling (no per-molecule cards)
 * - Vector SVG reaction arrows: ChemDraw forward arrow, dual-harpoon reversible (⇌), resonance (↔), retrosynthetic (⇒)
 * - Scientific condition formatting: clean typography above (reagents, catalysts, temp) and below (solvents, pressure, heat Δ)
 * - Dynamic arrow width expanding to fit condition text
 * - Multi-step sequential schemes with intermediate continuity (A -> B -> C)
 * - Support for reactive intermediate brackets [ ... ]
 * - Isolated LTR container for chemical graph coordinates with RTL Persian educational metadata
 * - Dual Light/Dark mode reactive palette integration
 * - Preserves SmilesDrawerGeometryAdapter and MechanismOverlay electron-pushing arrow integration
 * - Smooth horizontal scrolling on mobile viewports with no unreadable scaling
 * - Zero remote dependencies (pure local, offline, deterministic SVG generation)
 */

import React, { useEffect, useRef, useState, useId } from "react";
import {
  type ChemicalReaction,
  type ChemicalReactionParticipant,
  type ChemicalReactionStep,
  type ChemicalReactionCondition,
  type ChemicalReactionMechanism,
  validateChemicalReaction,
  getMoleculeComplexity,
  toPersianDigits,
} from "@avana/domain";
import {
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  Maximize2,
  Minimize2,
  GitCommit,
  Layers,
  Sparkles,
} from "lucide-react";
import { renderMechanismOverlayToSvg } from "./MechanismOverlay.js";
import {
  extractMoleculeGeometry,
  type MoleculeGeometry,
} from "./SmilesDrawerGeometryAdapter.js";
import {
  routeMechanismArrow,
  buildObstacleMap,
  computeBetaHydrogenGeometry,
  type Point,
} from "./MechanismRouting.js";

export type ReactionLayoutMode = "compact" | "expanded" | "stepped";

export interface ReactionBlockProps {
  reaction: ChemicalReaction;
  className?: string;
  layout?: ReactionLayoutMode;
  moleculeWidth?: number;
  moleculeHeight?: number;
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

/**
 * Normalizes chemical formulas and conditions by formatting digits
 * following element symbols or closing parentheses as subscripts,
 * while leaving temperatures, pressures, times, and stoichiometric ratios intact.
 */
export function formatChemicalFormula(text: string): React.ReactNode {
  if (!text || typeof text !== "string") return text;
  if (!/\d/.test(text)) return text;

  // Split on letters or closing parentheses followed by digits (e.g. H2SO4, Pd(PPh3)4, CH2Cl2)
  const regex = /([A-Za-z)])(\d+)/g;
  if (!regex.test(text)) return text;
  regex.lastIndex = 0;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(match[1]);
    parts.push(
      <sub key={match.index} className="text-[0.75em] leading-none align-baseline relative -bottom-[0.2em]">
        {match[2]}
      </sub>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return (
    <span className="inline-flex items-center">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {parts}
      </span>
    </span>
  );
}

/**
 * Fits the SVG viewBox tightly to the bounding box of drawn atoms,
 * and sets the SVG pixel dimensions directly to the bounding box dimensions.
 * This guarantees 1:1 proportional scaling where every bond length is identical
 * across the entire reaction scheme.
 */
function fitSvgViewBox(
  svg: SVGSVGElement,
  defaultWidth: number,
  defaultHeight: number,
  padding = 10,
) {
  try {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let foundCoords = false;

    if (typeof svg.getBBox === "function") {
      try {
        const bbox = svg.getBBox();
        if (bbox && (bbox.width > 0 || bbox.height > 0)) {
          minX = bbox.x;
          minY = bbox.y;
          maxX = bbox.x + bbox.width;
          maxY = bbox.y + bbox.height;
          foundCoords = true;
        }
      } catch {
        // getBBox can throw in jsdom/headless testing environments
      }
    }

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
      const w = Math.max(maxX - minX, 16);
      const h = Math.max(maxY - minY, 16);
      const vx = Math.round(minX - padding);
      const vy = Math.round(minY - padding);
      const vw = Math.round(w + padding * 2);
      const vh = Math.round(h + padding * 2);
      svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
      svg.setAttribute("width", `${vw}`);
      svg.setAttribute("height", `${vh}`);
      svg.style.width = `${vw}px`;
      svg.style.height = `${vh}px`;
    } else {
      svg.setAttribute("viewBox", `0 0 ${defaultWidth} ${defaultHeight}`);
      svg.setAttribute("width", `${defaultWidth}`);
      svg.setAttribute("height", `${defaultHeight}`);
      svg.style.width = `${defaultWidth}px`;
      svg.style.height = `${defaultHeight}px`;
    }
  } catch {
    svg.setAttribute("viewBox", `0 0 ${defaultWidth} ${defaultHeight}`);
    svg.setAttribute("width", `${defaultWidth}`);
    svg.setAttribute("height", `${defaultHeight}`);
    svg.style.width = `${defaultWidth}px`;
    svg.style.height = `${defaultHeight}px`;
  }
}

/**
 * Single Molecule structure inside a reaction scheme.
 * Renders at true 1:1 proportional scale with consistent bond lengths,
 * without artificial card enclosures or fixed-height canvas distortion.
 */
export interface ReactionMoleculeCardProps {
  participant: ChemicalReactionParticipant;
  role: "reactant" | "product" | "intermediate";
  participantIndex?: number;
  layoutMode: ReactionLayoutMode;
  customWidth?: number;
  customHeight?: number;
  mechanism?: ChemicalReactionMechanism;
  showMechanism?: boolean;
  isIntermediate?: boolean;
  suppressIntermolecularStubs?: boolean;
  onGeometryReady?: (
    participantIndex: number,
    geom: MoleculeGeometry,
    svgElement: SVGSVGElement,
  ) => void;
}

export function ReactionMoleculeCard({
  participant,
  role,
  participantIndex = 0,
  layoutMode,
  customWidth,
  customHeight,
  mechanism,
  showMechanism = true,
  isIntermediate = false,
  suppressIntermolecularStubs = false,
  onGeometryReady,
}: ReactionMoleculeCardProps) {
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const cardId = useId().replace(/:/g, "_");

  const complexity = React.useMemo(() => {
    return getMoleculeComplexity(participant.smiles || "");
  }, [participant.smiles]);

  const { drawWidth, drawHeight } = React.useMemo(() => {
    if (customWidth && customHeight) {
      return { drawWidth: customWidth, drawHeight: customHeight };
    }
    const scale = complexity.recommendedScale || 1.0;
    return {
      drawWidth: Math.round(320 * scale),
      drawHeight: Math.round(220 * scale),
    };
  }, [complexity, customWidth, customHeight]);

  useEffect(() => {
    let isMounted = true;
    const container = svgContainerRef.current;
    if (!container || !participant.smiles || participant.smiles.trim().length === 0) {
      return;
    }

    try {
      container.innerHTML = "";
      setRenderError(null);

      const targetSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      targetSvg.setAttribute("id", `rxn_mol_${cardId}`);
      targetSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      targetSvg.classList.add("overflow-visible");
      container.appendChild(targetSvg);

      const isDarkMode =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark");

      const baseBondLength = layoutMode === "compact" ? 18 : 20;
      const basePadding = layoutMode === "compact" ? 6 : 10;

      const drawerOptions = {
        width: drawWidth,
        height: drawHeight,
        bondThickness: layoutMode === "compact" ? 1.5 : 1.7,
        bondLength: baseBondLength,
        shortBondLength: 0.85,
        bondSpacing: 0.18 * baseBondLength,
        atomVisualization: "default",
        isomeric: true,
        compactDrawing: layoutMode === "compact",
        fontSizeLarge: layoutMode === "compact" ? 9 : 10.5,
        fontSizeSmall: layoutMode === "compact" ? 7 : 8,
        padding: basePadding,
        themes: {
          light: {
            C: "#0f172a",
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
            H: "#475569",
            BACKGROUND: "transparent",
          },
          dark: {
            C: "#f8fafc",
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
            participant.smiles.trim(),
            (parseTree: unknown) => {
              if (!isMounted) return;
              try {
                svgDrawer.draw(
                  parseTree,
                  targetSvg,
                  isDarkMode ? "dark" : "light",
                  false,
                );

                if (showMechanism && mechanism && mechanism.isVerified) {
                  renderMechanismOverlayToSvg(
                    targetSvg,
                    svgDrawer,
                    mechanism,
                    role === "intermediate" ? "product" : role,
                    participantIndex,
                    isDarkMode,
                    suppressIntermolecularStubs,
                  );
                }

                fitSvgViewBox(targetSvg, drawWidth, drawHeight, basePadding);

                if (onGeometryReady) {
                  const geom = extractMoleculeGeometry(svgDrawer);
                  if (geom) {
                    onGeometryReady(participantIndex, geom, targetSvg);
                  }
                }
              } catch (drawErr) {
                if (isMounted) {
                  setRenderError(
                    drawErr instanceof Error ? drawErr.message : "خطا در رسم ساختار",
                  );
                }
              }
            },
            (parseErr: Error) => {
              if (!isMounted) return;
              setRenderError(parseErr?.message || "خطا در پردازش SMILES");
            },
          );
        })
        .catch((loadErr) => {
          if (!isMounted) return;
          setRenderError(
            loadErr instanceof Error
              ? `خطای بارگذاری ماژول: ${loadErr.message}`
              : "خطا در ماژول رسم",
          );
        });
    } catch (err) {
      if (isMounted) {
        setRenderError(err instanceof Error ? err.message : "خطای ناشناخته");
      }
    }

    return () => {
      isMounted = false;
    };
  }, [
    participant.smiles,
    drawWidth,
    drawHeight,
    cardId,
    layoutMode,
    showMechanism,
    mechanism,
    role,
    participantIndex,
    suppressIntermolecularStubs,
    onGeometryReady,
  ]);

  const showIntermediateBracket =
    isIntermediate || participant.isIntermediate || role === "intermediate";

  return (
    <div
      className="flex flex-col items-center justify-center p-1 shrink-0 select-none"
      dir="ltr"
      data-testid={`rxn-${role}-card`}
    >
      {/* SVG Canvas Area */}
      <div className="flex items-center justify-center relative p-1 min-h-[48px]">
        {renderError ? (
          <div className="p-2 text-[10px] text-rose-600 dark:text-rose-400 text-center font-mono bg-rose-50 dark:bg-rose-950/30 rounded border border-rose-200 dark:border-rose-900/50">
            <span className="block font-bold">خطای رندر</span>
            <span className="truncate block max-w-[120px]">{participant.smiles}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            {/* Stoichiometric Coefficient directly preceding the molecule */}
            {typeof participant.coefficient === "number" && participant.coefficient > 1 && (
              <span
                className="text-base sm:text-lg font-bold font-serif text-slate-800 dark:text-slate-200 me-2 select-none self-center"
                data-testid="rxn-coefficient"
              >
                {participant.coefficient}×
              </span>
            )}

            {/* Intermediate left bracket */}
            {showIntermediateBracket && (
              <span
                className="text-3xl sm:text-4xl font-light text-slate-400 dark:text-slate-500 me-1 select-none self-center"
                aria-hidden="true"
              >
                [
              </span>
            )}

            <div
              ref={svgContainerRef}
              className="flex items-center justify-center [unicode-bidi:isolate]"
            />

            {/* Intermediate right bracket */}
            {showIntermediateBracket && (
              <span
                className="text-3xl sm:text-4xl font-light text-slate-400 dark:text-slate-500 ms-1 select-none self-center"
                aria-hidden="true"
              >
                ]
              </span>
            )}
          </div>
        )}
      </div>

      {/* Participant Title / Formula Label */}
      {(participant.name || participant.formula) && (
        <div className="w-full mt-1.5 text-center select-text" dir="rtl">
          {participant.name && (
            <span
              className="text-xs sm:text-[13px] font-semibold text-slate-800 dark:text-slate-200 block truncate max-w-[220px] mx-auto"
              title={participant.name}
            >
              {participant.name}
            </span>
          )}
          {participant.formula && (
            <span
              className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tracking-wide block"
              dir="ltr"
            >
              {formatChemicalFormula(participant.formula)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function parseSvgViewBox(svg: SVGSVGElement | null): { vx: number; vy: number; vw: number; vh: number } {
  if (!svg) return { vx: 0, vy: 0, vw: 100, vh: 100 };
  const vbAttr = svg.getAttribute("viewBox");
  if (vbAttr) {
    const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
      return { vx: parts[0], vy: parts[1], vw: parts[2], vh: parts[3] };
    }
  }
  return { vx: 0, vy: 0, vw: 100, vh: 100 };
}

/**
 * Transforms a point from a participant's local SVG coordinate system to
 * the shared participants row container coordinate space.
 */
function transformLocalPointToContainer(
  point: Point,
  svgElement: SVGSVGElement | null,
  containerElement: HTMLElement | null,
  fallbackOffsetX = 0,
  fallbackOffsetY = 0,
): Point {
  if (!svgElement || !containerElement) {
    return { x: point.x + fallbackOffsetX, y: point.y + fallbackOffsetY };
  }

  const { vx, vy, vw, vh } = parseSvgViewBox(svgElement);
  const svgW = parseFloat(svgElement.getAttribute("width") || "0") || vw;
  const svgH = parseFloat(svgElement.getAttribute("height") || "0") || vh;

  try {
    const svgRect = svgElement.getBoundingClientRect();
    const contRect = containerElement.getBoundingClientRect();

    if (svgRect.width > 0 && contRect.width > 0) {
      const scaleX = svgRect.width / vw;
      const scaleY = svgRect.height / vh;

      const screenX = svgRect.left + (point.x - vx) * scaleX;
      const screenY = svgRect.top + (point.y - vy) * scaleY;

      return {
        x: screenX - contRect.left,
        y: screenY - contRect.top,
      };
    }
  } catch {
    // Fall back to deterministic offsets
  }

  // Exact deterministic fallback for JSDOM / headless environments
  const scaleX = svgW / vw;
  const scaleY = svgH / vh;
  const localX = (point.x - vx) * scaleX;
  const localY = (point.y - vy) * scaleY;

  return {
    x: fallbackOffsetX + localX,
    y: fallbackOffsetY + localY,
  };
}

export interface IntermolecularArrowItem {
  id: string;
  d: string;
  color: string;
  markerEnd: string;
  strokeWidth: number;
}

export interface ReactionParticipantsRowProps {
  participants: ChemicalReactionParticipant[];
  role: "reactant" | "product" | "intermediate";
  layoutMode: ReactionLayoutMode;
  customWidth?: number;
  customHeight?: number;
  mechanism?: ChemicalReactionMechanism;
  showMechanism?: boolean;
  isIntermediate?: boolean;
}

/**
 * Unified Reaction Participants Row Component.
 * Hosts participants with consistent spacing and a shared intermolecular mechanism layer.
 */
export function ReactionParticipantsRow({
  participants,
  role,
  layoutMode,
  customWidth,
  customHeight,
  mechanism,
  showMechanism = true,
  isIntermediate = false,
}: ReactionParticipantsRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometries, setGeometries] = useState<
    Map<number, { geometry: MoleculeGeometry; svg: SVGSVGElement }>
  >(new Map());
  const [intermolecularArrows, setIntermolecularArrows] = useState<
    IntermolecularArrowItem[]
  >([]);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const handleGeometryReady = React.useCallback(
    (pIdx: number, geom: MoleculeGeometry, svg: SVGSVGElement) => {
      setGeometries((prev) => {
        const next = new Map(prev);
        next.set(pIdx, { geometry: geom, svg });
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    const handleResize = () => setLayoutVersion((v) => v + 1);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!showMechanism || !mechanism || !mechanism.isVerified) {
      setIntermolecularArrows([]);
      return;
    }

    let candidateArrows = mechanism.arrows || [];
    if (candidateArrows.length === 0 && mechanism.reactionCenter) {
      const rc = mechanism.reactionCenter;
      if (rc.nucleophile && rc.electrophile) {
        candidateArrows = [
          {
            id: "arrow_nu_to_c",
            type: "lone_pair_to_atom",
            from: {
              type: "lone_pair",
              atom: rc.nucleophile,
            },
            to: {
              type: "atom",
              atom: rc.electrophile,
            },
            direction: "counter-clockwise",
          },
        ];
      }
    }

    const interArrows = candidateArrows.filter((arrow) => {
      if (arrow.type !== "lone_pair_to_atom" && arrow.type !== "atom_to_atom") return false;
      const fromRef = arrow.from.atom;
      const toRef = arrow.to.atom;
      if (!fromRef || !toRef) return false;

      const fromRole = fromRef.participantRole || "reactant";
      const toRole = toRef.participantRole || "reactant";
      const fromIdx = fromRef.participantIndex ?? 0;
      const toIdx = toRef.participantIndex ?? 0;

      return fromRole === role && toRole === role && fromIdx !== toIdx;
    });

    if (interArrows.length === 0) {
      setIntermolecularArrows([]);
      return;
    }

    const containerEl = containerRef.current;
    const computedList: IntermolecularArrowItem[] = [];

    // Fallback deterministic offsets for headless tests
    const svgHeights: number[] = [];
    for (let i = 0; i < participants.length; i++) {
      const pData = geometries.get(i);
      const vb = parseSvgViewBox(pData?.svg || null);
      const h = parseFloat(pData?.svg?.getAttribute("height") || "0") || vb.vh || 60;
      svgHeights.push(h);
    }
    const maxSvgH = Math.max(...svgHeights, 60);

    const fallbackOffsets: Point[] = [];
    let accX = 0;
    for (let i = 0; i < participants.length; i++) {
      const pData = geometries.get(i);
      const vb = parseSvgViewBox(pData?.svg || null);
      const w = parseFloat(pData?.svg?.getAttribute("width") || "0") || vb.vw || 120;
      const h = svgHeights[i] || 60;
      const yOffset = (maxSvgH - h) / 2 + 8;
      fallbackOffsets.push({ x: accX + 8, y: yOffset });
      accX += w + 48;
    }

    // Build multi-participant obstacle map
    const obstacleGeometries: Array<{
      geometry: MoleculeGeometry;
      participantIndex: number;
      offsetX: number;
      offsetY: number;
      scale: number;
    }> = [];

    for (const [pIdx, item] of geometries.entries()) {
      const pOffset = transformLocalPointToContainer(
        { x: 0, y: 0 },
        item.svg,
        containerEl,
        fallbackOffsets[pIdx]?.x || 0,
        fallbackOffsets[pIdx]?.y || 0,
      );
      obstacleGeometries.push({
        geometry: item.geometry,
        participantIndex: pIdx,
        offsetX: pOffset.x,
        offsetY: pOffset.y,
        scale: 1,
      });
    }

    const multiObstacleMap = buildObstacleMap(obstacleGeometries);

    for (const arrow of interArrows) {
      const fromRef = arrow.from.atom;
      const toRef = arrow.to.atom;
      if (!fromRef || !toRef) continue;

      const fromIdx = fromRef.participantIndex ?? 0;
      const toIdx = toRef.participantIndex ?? 0;

      const fromItem = geometries.get(fromIdx);
      const toItem = geometries.get(toIdx);
      if (!fromItem || !toItem) continue;

      const fromAtom = fromItem.geometry.atoms.find((a) => a.index === fromRef.atomIndex);
      const toAtom = toItem.geometry.atoms.find((a) => a.index === toRef.atomIndex);
      if (!fromAtom || !toAtom) continue;

      // 1. Resolve source anchor
      let srcLocalPt: Point = { x: fromAtom.x, y: fromAtom.y };
      if (fromAtom.lonePairs && fromAtom.lonePairs.length > 0) {
        const explicitLpIdx = arrow.lonePairIndex ?? arrow.from.lonePairIndex;
        if (explicitLpIdx !== undefined && fromAtom.lonePairs[explicitLpIdx]) {
          srcLocalPt = { x: fromAtom.lonePairs[explicitLpIdx].x, y: fromAtom.lonePairs[explicitLpIdx].y };
        } else {
          // Pointing towards target participant
          const dir = toIdx >= fromIdx ? 1 : -1;
          let bestLp = fromAtom.lonePairs[0];
          let maxDot = -Infinity;
          for (const lp of fromAtom.lonePairs) {
            const dot = (lp.x - fromAtom.x) * dir;
            if (dot > maxDot) {
              maxDot = dot;
              bestLp = lp;
            }
          }
          srcLocalPt = { x: bestLp.x, y: bestLp.y };
        }
      }

      const sourcePt = transformLocalPointToContainer(
        srcLocalPt,
        fromItem.svg,
        containerEl,
        fallbackOffsets[fromIdx]?.x || 0,
        fallbackOffsets[fromIdx]?.y || 0,
      );

      // 2. Resolve target anchor
      let tgtLocalPt: Point = { x: toAtom.x, y: toAtom.y };
      if (mechanism.reactionType === "E2" && toAtom.element === "C") {
        const cAlpha = toItem.geometry.atoms.find((a) => toAtom.neighborIndices.includes(a.index) && a.element === "C");
        if (cAlpha) {
          const lgAtom = toItem.geometry.atoms.find(
            (a) =>
              cAlpha.neighborIndices.includes(a.index) &&
              a.index !== toAtom.index &&
              ["BR", "CL", "I", "F", "O"].includes(a.element.toUpperCase()),
          );
          const betaH = computeBetaHydrogenGeometry(
            toAtom,
            cAlpha,
            lgAtom,
            toItem.geometry.averageBondLength || 25,
          );
          tgtLocalPt = { x: betaH.x, y: betaH.y };
        }
      }

      const targetPt = transformLocalPointToContainer(
        tgtLocalPt,
        toItem.svg,
        containerEl,
        fallbackOffsets[toIdx]?.x || 0,
        fallbackOffsets[toIdx]?.y || 0,
      );

      // 3. Obstacle-aware routing
      const avgBond = Math.min(
        fromItem.geometry.averageBondLength || 25,
        toItem.geometry.averageBondLength || 25,
      );

      const route = routeMechanismArrow(
        {
          source: sourcePt,
          target: targetPt,
          sourceEntityId: `atom_p${fromIdx}_${fromAtom.index}`,
          targetEntityId: `atom_p${toIdx}_${toAtom.index}`,
          targetType: "atom",
          targetRadius: Math.max(7.5, avgBond * 0.3),
          preferredDirection:
            arrow.direction || (targetPt.x >= sourcePt.x ? "clockwise" : "counter-clockwise"),
          curveOffset: arrow.curveOffset,
          bondLength: avgBond,
        },
        multiObstacleMap,
      );

      computedList.push({
        id: arrow.id || `inter_arrow_${fromIdx}_${toIdx}`,
        d: route.d,
        color: "#0d9488",
        markerEnd:
          arrow.electronCount === 1
            ? "url(#inter-arrowhead-fishhook-teal)"
            : "url(#inter-arrowhead-teal)",
        strokeWidth: Math.max(1.6, Math.min(2.2, avgBond * 0.065)),
      });
    }

    setIntermolecularArrows(computedList);
  }, [geometries, mechanism, showMechanism, role, participants, layoutVersion]);

  return (
    <div className="flex items-center relative" ref={containerRef}>
      {participants.map((participant, pIdx) => (
        <React.Fragment key={pIdx}>
          <ReactionMoleculeCard
            participant={participant}
            role={role}
            participantIndex={pIdx}
            layoutMode={layoutMode}
            customWidth={customWidth}
            customHeight={customHeight}
            mechanism={mechanism}
            showMechanism={showMechanism}
            isIntermediate={isIntermediate || !!participant.isIntermediate}
            suppressIntermolecularStubs={true}
            onGeometryReady={handleGeometryReady}
          />
          {pIdx < participants.length - 1 && <PlusSeparator />}
        </React.Fragment>
      ))}

      {/* Unified Intermolecular ChemDraw Reaction Arrow Overlay */}
      {intermolecularArrows.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
          style={{ zIndex: 10 }}
          data-testid="intermolecular-mechanism-overlay"
        >
          <defs>
            <marker
              id="inter-arrowhead-teal"
              markerWidth="8"
              markerHeight="8"
              refX="6.2"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 1 0.6 L 6.5 3 L 1 5.4 L 2.6 3 Z" fill="#0d9488" />
            </marker>
            <marker
              id="inter-arrowhead-rose"
              markerWidth="8"
              markerHeight="8"
              refX="6.2"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 1 0.6 L 6.5 3 L 1 5.4 L 2.6 3 Z" fill="#e11d48" />
            </marker>
            <marker
              id="inter-arrowhead-fishhook-teal"
              markerWidth="8"
              markerHeight="8"
              refX="6.2"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 1 0.6 L 6.5 3 L 2.6 3 Z" fill="#0d9488" />
            </marker>
          </defs>
          {intermolecularArrows.map((arrow) => (
            <path
              key={arrow.id}
              id={arrow.id}
              d={arrow.d}
              fill="none"
              stroke={arrow.color}
              strokeWidth={arrow.strokeWidth}
              strokeLinecap="round"
              markerEnd={arrow.markerEnd}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

/**
 * Reaction Arrow with ChemDraw SVG vector rendering and clean scientific annotations.
 */
export interface ReactionArrowProps {
  arrowType?: "forward" | "reversible" | "resonance" | "retrosynthetic" | "equilibrium" | "no-reaction";
  reversible?: boolean;
  reagents?: string[];
  catalysts?: string[];
  solvents?: string[];
  conditions?: Array<string | ChemicalReactionCondition>;
  temperature?: string;
  pressure?: string;
  yieldValue?: string;
  isSteppedVertical?: boolean;
}

export function ReactionArrowView({
  arrowType = "forward",
  reversible = false,
  reagents = [],
  catalysts = [],
  solvents = [],
  conditions = [],
  temperature,
  pressure,
  yieldValue,
  isSteppedVertical = false,
}: ReactionArrowProps) {
  const aboveItems: string[] = [...reagents, ...catalysts];
  if (temperature) aboveItems.push(temperature);
  if (yieldValue) aboveItems.push(`بازده: ${yieldValue}`);

  const belowItems: string[] = [...solvents];
  if (pressure) belowItems.push(pressure);

  for (const c of conditions) {
    if (typeof c === "string") {
      if (c === "Δ" || c === "heat" || c === "حرارت" || c.toLowerCase().includes("reflux")) {
        belowItems.push(c);
      } else {
        aboveItems.push(c);
      }
    } else if (c && typeof c === "object" && c.value) {
      if (c.position === "below") belowItems.push(c.value);
      else aboveItems.push(c.value);
    }
  }

  // Calculate arrow length based on conditions text length
  const allTexts = [...aboveItems, ...belowItems];
  const maxLen = allTexts.reduce((max, s) => Math.max(max, s.length), 0);
  const arrowWidth = Math.max(84, Math.min(260, maxLen * 7.5 + 32));

  const isReversible = reversible || arrowType === "reversible" || arrowType === "equilibrium";
  const effectiveType = isReversible ? "reversible" : (arrowType || "forward");

  return (
    <div
      className={`flex flex-col items-center justify-center ${
        isSteppedVertical
          ? "my-3 w-full"
          : "mx-3 sm:mx-4 my-auto shrink-0 self-center"
      } text-center`}
      dir="ltr"
      data-testid="reaction-arrow"
    >
      {/* Above Arrow Conditions (Reagents, Catalysts, Temp, Yield) */}
      {aboveItems.length > 0 && (
        <div className="text-xs sm:text-[13px] font-medium text-slate-800 dark:text-slate-200 pb-1.5 leading-snug flex flex-col items-center justify-center">
          {aboveItems.map((item, idx) => (
            <span key={idx} className="whitespace-nowrap px-1">
              {formatChemicalFormula(item)}
            </span>
          ))}
        </div>
      )}

      {/* Main ChemDraw Vector SVG Arrow */}
      <div className="flex items-center justify-center my-0.5" style={{ width: arrowWidth }}>
        {effectiveType === "reversible" ? (
          // Equilibrium / Reversible dual harpoon arrow (⇌)
          <svg
            width={arrowWidth}
            height={24}
            viewBox={`0 0 ${arrowWidth} 24`}
            className="overflow-visible text-slate-800 dark:text-slate-200"
            aria-hidden="true"
          >
            {/* Top arrow pointing right with upper harpoon */}
            <line
              x1={2}
              y1={8}
              x2={arrowWidth - 2}
              y2={8}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <path
              d={`M ${arrowWidth - 2} 8 L ${arrowWidth - 10} 3`}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              fill="none"
            />
            {/* Bottom arrow pointing left with lower harpoon */}
            <line
              x1={arrowWidth - 2}
              y1={16}
              x2={2}
              y2={16}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <path
              d={`M 2 16 L 10 21`}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        ) : effectiveType === "resonance" ? (
          // Resonance double-headed arrow (↔)
          <svg
            width={arrowWidth}
            height={24}
            viewBox={`0 0 ${arrowWidth} 24`}
            className="overflow-visible text-slate-800 dark:text-slate-200"
            aria-hidden="true"
          >
            <line
              x1={8}
              y1={12}
              x2={arrowWidth - 8}
              y2={12}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            {/* Right head */}
            <path
              d={`M ${arrowWidth - 1} 12 L ${arrowWidth - 10} 7.5 C ${arrowWidth - 8.5} 9.5 ${arrowWidth - 8.5} 14.5 ${arrowWidth - 10} 16.5 Z`}
              fill="currentColor"
            />
            {/* Left head */}
            <path
              d={`M 1 12 L 10 7.5 C 8.5 9.5 8.5 14.5 10 16.5 Z`}
              fill="currentColor"
            />
          </svg>
        ) : effectiveType === "retrosynthetic" ? (
          // Retrosynthetic double-shaft open arrow (⇒)
          <svg
            width={arrowWidth}
            height={24}
            viewBox={`0 0 ${arrowWidth} 24`}
            className="overflow-visible text-slate-800 dark:text-slate-200"
            aria-hidden="true"
          >
            <line x1={2} y1={9} x2={arrowWidth - 10} y2={9} stroke="currentColor" strokeWidth={1.4} />
            <line x1={2} y1={15} x2={arrowWidth - 10} y2={15} stroke="currentColor" strokeWidth={1.4} />
            <path
              d={`M ${arrowWidth - 12} 4 L ${arrowWidth - 2} 12 L ${arrowWidth - 12} 20`}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        ) : effectiveType === "no-reaction" ? (
          // No reaction arrow with diagonal slash (↛)
          <svg
            width={arrowWidth}
            height={24}
            viewBox={`0 0 ${arrowWidth} 24`}
            className="overflow-visible text-slate-800 dark:text-slate-200"
            aria-hidden="true"
          >
            <line
              x1={2}
              y1={12}
              x2={arrowWidth - 8}
              y2={12}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <path
              d={`M ${arrowWidth - 1} 12 L ${arrowWidth - 10} 7.5 C ${arrowWidth - 8.5} 9.5 ${arrowWidth - 8.5} 14.5 ${arrowWidth - 10} 16.5 Z`}
              fill="currentColor"
            />
            <line
              x1={arrowWidth / 2 - 4}
              y1={5}
              x2={arrowWidth / 2 + 2}
              y2={19}
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <line
              x1={arrowWidth / 2}
              y1={5}
              x2={arrowWidth / 2 + 6}
              y2={19}
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </svg>
        ) : (
          // Standard Forward ChemDraw Vector Arrow (→)
          <svg
            width={arrowWidth}
            height={24}
            viewBox={`0 0 ${arrowWidth} 24`}
            className="overflow-visible text-slate-800 dark:text-slate-200"
            aria-hidden="true"
          >
            <line
              x1={2}
              y1={12}
              x2={arrowWidth - 8}
              y2={12}
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
            <path
              d={`M ${arrowWidth - 1} 12 L ${arrowWidth - 10} 7.5 C ${arrowWidth - 8.5} 9.5 ${arrowWidth - 8.5} 14.5 ${arrowWidth - 10} 16.5 Z`}
              fill="currentColor"
            />
          </svg>
        )}
      </div>

      {/* Below Arrow Conditions (Solvents, Pressure, Heat Δ) */}
      {belowItems.length > 0 && (
        <div className="text-xs sm:text-[13px] font-medium text-slate-600 dark:text-slate-400 pt-1.5 leading-snug flex flex-col items-center justify-center">
          {belowItems.map((item, idx) => (
            <span key={idx} className="whitespace-nowrap px-1">
              {formatChemicalFormula(item)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Plus "+" Separator between reaction participants.
 */
export function PlusSeparator() {
  return (
    <div
      className="flex items-center justify-center mx-2 sm:mx-3 text-slate-400 dark:text-slate-500 font-bold text-lg sm:text-xl shrink-0 select-none self-center"
      aria-hidden="true"
    >
      +
    </div>
  );
}

/**
 * Main ReactionBlock Component.
 */
export function ReactionBlock({
  reaction,
  className = "",
  layout,
  moleculeWidth,
  moleculeHeight,
}: ReactionBlockProps) {
  const validation = React.useMemo(() => {
    return validateChemicalReaction(reaction);
  }, [reaction]);

  const stepsToRender: ChemicalReactionStep[] = React.useMemo(() => {
    if (Array.isArray(reaction.steps) && reaction.steps.length > 0) {
      return reaction.steps;
    }
    return [
      {
        stepNumber: 1,
        reactants: reaction.reactants || [],
        intermediates: reaction.intermediates,
        products: reaction.products || [],
        reagents: reaction.reagents,
        catalysts: reaction.catalysts,
        solvents: reaction.solvents,
        conditions: reaction.conditions,
        temperature: reaction.temperature,
        pressure: reaction.pressure,
        yield: reaction.yield,
        notes: reaction.description,
        reversible: reaction.reversible,
        arrowType: reaction.arrowType,
        mechanism: reaction.mechanism,
      },
    ];
  }, [reaction]);

  const isMultiStep = stepsToRender.length > 1;

  // Check if any step or top-level reaction has a mechanism defined
  const hasMechanism = stepsToRender.some((s) => !!s.mechanism) || !!reaction.mechanism;
  const [showMechanism, setShowMechanism] = useState<boolean>(true);

  // Active Layout State (defaults to reaction.layout, prop layout, or fallback)
  const initialLayout: ReactionLayoutMode = React.useMemo(() => {
    if (layout) return layout;
    if (reaction.layout) return reaction.layout;
    if (stepsToRender.length > 1) return "stepped";
    return "expanded";
  }, [layout, reaction.layout, stepsToRender.length]);

  const [activeLayout, setActiveLayout] = useState<ReactionLayoutMode>(initialLayout);

  // Sync state if props change
  useEffect(() => {
    if (layout) {
      setActiveLayout(layout);
    } else if (reaction.layout) {
      setActiveLayout(reaction.layout);
    }
  }, [layout, reaction.layout]);

  const primaryMechanism =
    reaction.mechanism || (stepsToRender.length > 0 ? stepsToRender[0].mechanism : undefined);

  return (
    <div
      className={`my-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs overflow-hidden transition-all text-right ${className}`.trim()}
      dir="rtl"
      data-testid="reaction-block"
      data-layout-mode={activeLayout}
      role="region"
      aria-label={reaction.title || "واکنش شیمیایی"}
    >
      {/* 1. Header with Reaction Title, Type, and Layout / Mechanism Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 border border-teal-500/20">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-[var(--color-text)] truncate">
                {reaction.title || "واکنش شیمیایی"}
              </span>
              {reaction.reactionType && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-800 dark:text-teal-300 font-medium shrink-0 border border-teal-500/20">
                  {reaction.reactionType}
                </span>
              )}
              {reaction.yield && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-medium shrink-0 border border-emerald-500/20">
                  بازده: {reaction.yield}
                </span>
              )}
            </div>
            {reaction.description && (
              <p className="text-[11px] text-[var(--color-text-muted)] truncate mt-0.5">
                {reaction.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mechanism Electron-Pushing Toggle Button */}
          {hasMechanism && (
            <button
              type="button"
              onClick={() => setShowMechanism(!showMechanism)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all border ${
                showMechanism
                  ? "bg-teal-500/15 border-teal-500/30 text-teal-800 dark:text-teal-200 shadow-2xs"
                  : "bg-slate-100 dark:bg-slate-800 border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
              title="نمایش فلش‌های منحنی انتقال الکترون و مراکز واکنش"
              data-testid="toggle-mechanism-btn"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{showMechanism ? "مکانیزم فعال" : "مکانیزم"}</span>
            </button>
          )}

          {/* Interactive Layout Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-200/60 dark:bg-slate-800/80 p-0.5 rounded-xl border border-[var(--color-border)] text-[11px]">
            {isMultiStep ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveLayout("stepped")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors ${
                    activeLayout === "stepped"
                      ? "bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs font-bold"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                  title="نمایش مرحله‌به‌مرحله"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">مرحله‌ای</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayout("expanded")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors ${
                    activeLayout !== "stepped"
                      ? "bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs font-bold"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                  title="نمایش زنجیره‌ای افقی"
                >
                  <GitCommit className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">زنجیره‌ای</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveLayout("expanded")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors ${
                    activeLayout === "expanded"
                      ? "bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs font-bold"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                  title="نمای بزرگنمایی‌شده"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span className="hidden sm:inline">گسترده</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayout("compact")}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg font-medium transition-colors ${
                    activeLayout === "compact"
                      ? "bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 shadow-2xs font-bold"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                  title="نمای فشرده"
                >
                  <Minimize2 className="w-3 h-3" />
                  <span className="hidden sm:inline">فشرده</span>
                </button>
              </>
            )}
          </div>

          {/* Validation / Review Status Badge */}
          {validation.needsReview ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-bold"
              title={validation.warnings.join("\n") || "نیازمند بازبینی اطلاعات واکنش"}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>نیازمند بازبینی علمی</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تأیید واکنش</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Main ChemDraw 2D Vector Scheme Viewport */}
      {activeLayout === "stepped" && isMultiStep ? (
        // STEPPED / VERTICAL LAYOUT MODE (for multi-step syntheses)
        <div className="p-4 sm:p-6 bg-slate-50/70 dark:bg-slate-950/60 space-y-4">
          {stepsToRender.map((step, sIdx) => {
            const stepMech = step.mechanism || (isMultiStep ? undefined : reaction.mechanism);
            const stepIntermediates = step.intermediates || [];
            return (
              <div key={sIdx} className="space-y-3">
                <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs">
                  {/* Step Title Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[var(--color-border)]/70">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-teal-500/15 text-teal-800 dark:text-teal-300 text-[11px] font-bold">
                        مرحله {toPersianDigits(step.stepNumber || sIdx + 1)}
                      </span>
                      {step.title && (
                        <span className="text-xs font-bold text-[var(--color-text)]">
                          {step.title}
                        </span>
                      )}
                    </div>
                    {step.yield && (
                      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded">
                        بازده: {step.yield}
                      </span>
                    )}
                  </div>

                  {/* Step Reaction Flow Row (Isolated LTR) */}
                  <div className="overflow-x-auto [scrollbar-width:thin] py-3" dir="ltr">
                    <div
                      className="flex items-center justify-center min-w-max mx-auto px-4 [unicode-bidi:isolate]"
                    >
                      {/* Reactants */}
                      <ReactionParticipantsRow
                        participants={step.reactants}
                        role="reactant"
                        layoutMode="stepped"
                        customWidth={moleculeWidth}
                        customHeight={moleculeHeight}
                        mechanism={stepMech}
                        showMechanism={showMechanism}
                      />

                      {/* Reaction Arrow 1 */}
                      <ReactionArrowView
                        arrowType={step.arrowType || reaction.arrowType}
                        reversible={step.reversible || reaction.reversible}
                        reagents={step.reagents}
                        catalysts={step.catalysts}
                        solvents={step.solvents}
                        conditions={step.conditions}
                        temperature={step.temperature}
                        pressure={step.pressure}
                      />

                      {/* Step Intermediates (if present within step) */}
                      {stepIntermediates.length > 0 && (
                        <>
                          <ReactionParticipantsRow
                            participants={stepIntermediates}
                            role="intermediate"
                            isIntermediate={true}
                            layoutMode="stepped"
                            customWidth={moleculeWidth}
                            customHeight={moleculeHeight}
                            mechanism={stepMech}
                            showMechanism={showMechanism}
                          />
                          <ReactionArrowView
                            arrowType={step.arrowType || reaction.arrowType}
                            reversible={step.reversible || reaction.reversible}
                          />
                        </>
                      )}

                      {/* Products */}
                      <ReactionParticipantsRow
                        participants={step.products}
                        role="product"
                        layoutMode="stepped"
                        customWidth={moleculeWidth}
                        customHeight={moleculeHeight}
                        mechanism={stepMech}
                        showMechanism={showMechanism}
                      />
                    </div>
                  </div>

                  {/* Step Notes if any */}
                  {step.notes && (
                    <div className="mt-2 pt-2 border-t border-[var(--color-border)]/50 text-[11px] text-[var(--color-text-muted)]">
                      {step.notes}
                    </div>
                  )}
                </div>

                {/* Downward connecting arrow to next step */}
                {sIdx < stepsToRender.length - 1 && (
                  <div className="flex justify-center text-teal-600 dark:text-teal-400 py-1" aria-hidden="true">
                    <svg width="24" height="24" viewBox="0 0 24 24" className="overflow-visible">
                      <line x1="12" y1="2" x2="12" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M 7 14 L 12 21 L 17 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        // HORIZONTAL CONTINUOUS LAYOUT (ChemDraw Scheme: Compact / Expanded / Horizontal chain)
        <div
          className="py-6 px-4 sm:px-8 bg-slate-50/70 dark:bg-slate-950/60 overflow-x-auto [scrollbar-width:thin] relative"
          dir="ltr"
        >
          <div
            className="flex items-center justify-start min-w-max mx-auto py-2 px-2 [unicode-bidi:isolate]"
          >
            {stepsToRender.map((step, sIdx) => {
              const isFirstStep = sIdx === 0;
              const isLastStep = sIdx === stepsToRender.length - 1;
              const stepMech = step.mechanism || (isMultiStep ? undefined : reaction.mechanism);
              const stepIntermediates = step.intermediates || [];

              return (
                <React.Fragment key={sIdx}>
                  {/* Reactants: rendered on first step, or any additional reactants on subsequent steps */}
                  {isFirstStep ? (
                    <ReactionParticipantsRow
                      participants={step.reactants}
                      role="reactant"
                      layoutMode={activeLayout}
                      customWidth={moleculeWidth}
                      customHeight={moleculeHeight}
                      mechanism={stepMech}
                      showMechanism={showMechanism}
                    />
                  ) : null}

                  {/* Reaction Arrow for this step */}
                  <ReactionArrowView
                    arrowType={step.arrowType || reaction.arrowType}
                    reversible={step.reversible || reaction.reversible}
                    reagents={step.reagents}
                    catalysts={step.catalysts}
                    solvents={step.solvents}
                    conditions={step.conditions}
                    temperature={step.temperature}
                    pressure={step.pressure}
                    yieldValue={step.yield}
                  />

                  {/* Single-step explicit intermediates (if any) */}
                  {!isMultiStep && stepIntermediates.length > 0 && (
                    <>
                      <ReactionParticipantsRow
                        participants={stepIntermediates}
                        role="intermediate"
                        isIntermediate={true}
                        layoutMode={activeLayout}
                        customWidth={moleculeWidth}
                        customHeight={moleculeHeight}
                        mechanism={stepMech}
                        showMechanism={showMechanism}
                      />
                      <ReactionArrowView
                        arrowType={step.arrowType || reaction.arrowType}
                        reversible={step.reversible || reaction.reversible}
                      />
                    </>
                  )}

                  {/* Intermediate products between steps in multi-step flow */}
                  {isMultiStep && !isLastStep && (
                    <ReactionParticipantsRow
                      participants={
                        step.products.length > 0
                          ? step.products
                          : (stepsToRender[sIdx + 1]?.reactants || [])
                      }
                      role="product"
                      layoutMode={activeLayout}
                      customWidth={moleculeWidth}
                      customHeight={moleculeHeight}
                      mechanism={stepMech}
                      showMechanism={showMechanism}
                    />
                  )}

                  {/* Final products on the last step */}
                  {isLastStep && (
                    <ReactionParticipantsRow
                      participants={step.products}
                      role="product"
                      layoutMode={activeLayout}
                      customWidth={moleculeWidth}
                      customHeight={moleculeHeight}
                      mechanism={stepMech}
                      showMechanism={showMechanism}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Mechanism Breakdown Card (when mechanism is enabled & verified) */}
      {hasMechanism && showMechanism && primaryMechanism?.isVerified && (
        <div
          className="px-5 py-3 bg-teal-500/5 dark:bg-teal-950/20 border-t border-teal-500/20 text-xs"
          data-testid="mechanism-details-section"
        >
          <div className="flex items-center gap-2 font-bold text-teal-800 dark:text-teal-300 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>
              مکانیزم واکنش:{" "}
              {primaryMechanism.reactionType?.toUpperCase().includes("SN2")
                ? "SN2 (جانشینی هسته‌دوستی دومولکولی)"
                : primaryMechanism.reactionType?.toUpperCase().includes("E2")
                ? "E2 (حذف دومولکولی)"
                : primaryMechanism.reactionType?.toUpperCase().includes("RESONANCE")
                ? "رزونانس (انتقال الکترون و پیوند پای)"
                : primaryMechanism.reactionType || "واکنش شیمیایی"}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[var(--color-text)]">
            {primaryMechanism.reactionCenter && (
              <div className="p-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-teal-500/20">
                <span className="font-bold text-teal-700 dark:text-teal-400 block mb-1">مراکز واکنش:</span>
                <ul className="space-y-0.5 text-[var(--color-text-muted)]">
                  {primaryMechanism.reactionCenter.nucleophile && (
                    <li>
                      • هسته‌دوست (Nu): اتم {primaryMechanism.reactionCenter.nucleophile.element || ""} (شاخص{" "}
                      {primaryMechanism.reactionCenter.nucleophile.atomIndex})
                    </li>
                  )}
                  {primaryMechanism.reactionCenter.electrophile && (
                    <li>
                      • الکتروفیل (E⁺): اتم {primaryMechanism.reactionCenter.electrophile.element || ""} (شاخص{" "}
                      {primaryMechanism.reactionCenter.electrophile.atomIndex})
                    </li>
                  )}
                  {primaryMechanism.reactionCenter.leavingGroup && (
                    <li>
                      • گروه ترک‌کننده (LG): اتم {primaryMechanism.reactionCenter.leavingGroup.element || ""} (شاخص{" "}
                      {primaryMechanism.reactionCenter.leavingGroup.atomIndex})
                    </li>
                  )}
                </ul>
              </div>
            )}
            {Array.isArray(primaryMechanism.bondChanges) && primaryMechanism.bondChanges.length > 0 && (
              <div className="p-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-teal-500/20">
                <span className="font-bold text-teal-700 dark:text-teal-400 block mb-1">تغییرات پیوندی:</span>
                <ul className="space-y-0.5 text-[var(--color-text-muted)]">
                  {primaryMechanism.bondChanges.map((bc, idx) => (
                    <li key={idx}>
                      {bc.type === "broken" &&
                        `• پیوند شکسته شد: ${bc.atom1.element || ""}-${bc.atom2.element || ""}`}
                      {bc.type === "formed" &&
                        `• پیوند جدید تشکیل شد: ${bc.atom1.element || ""}-${bc.atom2.element || ""}`}
                      {bc.type === "order_change" &&
                        `• تغییر مرتبه پیوند: ${bc.atom1.element || ""}-${bc.atom2.element || ""}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(primaryMechanism.arrows) &&
              primaryMechanism.arrows.length > 0 &&
              !primaryMechanism.reactionCenter && (
                <div className="p-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-teal-500/20 col-span-full">
                  <span className="font-bold text-teal-700 dark:text-teal-400 block mb-1">
                    مراحل انتقال الکترون:
                  </span>
                  <ul className="space-y-0.5 text-[var(--color-text-muted)]">
                    {primaryMechanism.arrows.map((arr, idx) => (
                      <li key={idx}>
                        • {arr.label || `حرکت جفت‌الکترون (${arr.type})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
          </div>
          {primaryMechanism.notes && (
            <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">{primaryMechanism.notes}</p>
          )}
        </div>
      )}

      {/* 4. Validation Warnings Callout (if any) */}
      {validation.warnings.length > 0 && (
        <div className="px-5 py-2.5 bg-amber-500/5 dark:bg-amber-950/20 border-t border-amber-500/20 text-xs text-amber-800 dark:text-amber-200">
          <ul className="list-disc ps-4 space-y-1">
            {validation.warnings.map((w, wIdx) => (
              <li key={wIdx}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
