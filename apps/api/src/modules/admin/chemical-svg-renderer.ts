/**
 * ChemicalSvgRenderer — Deterministic 2D Vector Molecular and Reaction Renderer for AVANA PDF Generation.
 *
 * Utilizes smiles-drawer and jsdom in Node.js to produce pure, responsive, high-resolution SVG markup
 * for single molecular structures and multi-molecular reaction schemes.
 */

import { createRequire } from "node:module";
// @ts-expect-error jsdom types are provided at runtime in node_modules
import { JSDOM } from "jsdom";

export interface SmilesRenderOptions {
  width?: number;
  height?: number;
  bondThickness?: number;
  bondLength?: number;
  padding?: number;
}

export interface ReactionRenderOptions {
  width?: number;
  height?: number;
  bondThickness?: number;
  bondLength?: number;
}

// Global DOM environment for SmilesDrawer in headless Node.js
let isDomInitialized = false;
let jsdomInstance: any = null;
let cachedSmilesDrawer: any = null;

function ensureDomEnvironment(): { document: any; SmilesDrawer: any } {
  if (isDomInitialized && jsdomInstance && cachedSmilesDrawer) {
    return {
      document: jsdomInstance.window.document,
      SmilesDrawer: cachedSmilesDrawer,
    };
  }

  jsdomInstance = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const win = jsdomInstance.window;

  (globalThis as any).window = win;
  (globalThis as any).document = win.document;
  (globalThis as any).SVGSVGElement = win.SVGSVGElement;
  (globalThis as any).HTMLElement = win.HTMLElement;
  (globalThis as any).Element = win.Element;
  (globalThis as any).Node = win.Node;

  // Mock HTMLCanvasElement 2D context for TextMetrics calculation in smiles-drawer
  win.HTMLCanvasElement.prototype.getContext = function (contextId: string): any {
    if (contextId === "2d") {
      return {
        font: "11pt Arial",
        fillStyle: "#000000",
        globalCompositeOperation: "source-over",
        beginPath: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        measureText: (txt: string) => {
          const str = txt ? String(txt) : "";
          const charWidth = 8;
          const w = Math.max(str.length * charWidth, 8);
          return {
            width: w,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: w,
            actualBoundingBoxAscent: 9,
            actualBoundingBoxDescent: 3,
          };
        },
      };
    }
    return null;
  };

  // smiles-drawer attaches to window.SmilesDrawer when window is defined
  const require = createRequire(import.meta.url);
  require("smiles-drawer");
  cachedSmilesDrawer = (win as any).SmilesDrawer;

  isDomInitialized = true;
  return { document: win.document, SmilesDrawer: cachedSmilesDrawer };
}

/**
 * Fits the SVG viewBox tightly to drawn elements, identical to AVANA Web ChemicalStructureBlock.
 */
function fitSvgViewBox(
  svg: any,
  defaultWidth: number,
  defaultHeight: number,
  padding = 16,
): void {
  try {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let foundCoords = false;

    const elements = svg.querySelectorAll("line, text, circle, polygon, path, rect");
    elements.forEach((el: any) => {
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
          minX = Math.min(minX, x - 12);
          maxX = Math.max(maxX, x + 12);
          minY = Math.min(minY, y - 12);
          maxY = Math.max(maxY, y + 12);
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

    if (foundCoords && isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
      const w = Math.max(maxX - minX, 24);
      const h = Math.max(maxY - minY, 24);
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

// In-memory LRU-like cache for generated SVGs to optimize multi-session chapter PDFs
const SVG_CACHE = new Map<string, string>();
const MAX_CACHE_ENTRIES = 500;

function getCached(key: string): string | undefined {
  const val = SVG_CACHE.get(key);
  if (val) {
    SVG_CACHE.delete(key);
    SVG_CACHE.set(key, val);
  }
  return val;
}

function setCached(key: string, val: string): void {
  if (SVG_CACHE.has(key)) {
    SVG_CACHE.delete(key);
  } else if (SVG_CACHE.size >= MAX_CACHE_ENTRIES) {
    const oldest = SVG_CACHE.keys().next().value;
    if (oldest !== undefined) {
      SVG_CACHE.delete(oldest);
    }
  }
  SVG_CACHE.set(key, val);
}

/**
 * Post-processes generated SVG to ensure 100% fidelity in Chromium print-to-pdf vector streams.
 * 1. Replaces radial gradient strokes with solid dark lines (Skia PDF device drops gradient strokes on <line>).
 * 2. Converts CSS style="transform: translateX(...) translateY(...)" into standard SVG 1.1 transform="translate(x, y)".
 * 3. Replaces faint hydrogen gray (#666666 / #64748b) with crisp dark text (#0f172a).
 * 4. Ensures clean font-family and weights for print resolution.
 */
function sanitizeAndOptimizeSvgForPdf(rawSvg: string): string {
  if (!rawSvg) return "";
  let svg = rawSvg;

  // 1. Replace gradient stroke with solid dark bond line
  svg = svg.replace(/stroke="url\(#[^"]+\)"/g, 'stroke="#0f172a"');

  // 2. Remove unused radialGradient tags
  svg = svg.replace(/<radialGradient[\s\S]*?<\/radialGradient>/g, "");

  // 3. Convert CSS transforms on <g> elements to standard SVG XML attribute transform="translate(x, y)"
  svg = svg.replace(
    /style="[^"]*transform:\s*translateX\(([-\d.]+)px\)\s*translateY\(([-\d.]+)px\)[^"]*"/g,
    'transform="translate($1, $2)"'
  );

  // 4. Boost contrast on faint gray labels
  svg = svg.replace(/fill="#666666"/g, 'fill="#0f172a"');
  svg = svg.replace(/fill="#64748b"/g, 'fill="#0f172a"');

  // 5. Ensure readable font styling in print
  svg = svg.replace(
    /font:\s*11pt Arial[^;"]*/g,
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 11pt; font-weight: 700'
  );
  svg = svg.replace(
    /font:\s*8pt Arial[^;"]*/g,
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 8pt; font-weight: 700'
  );

  // 6. Convert SVG <mask id="...-text-mask"> into controlled vector background circles under atom text.
  // In Chromium/Skia, SVG transparency masks create PDF /SMask objects whose userSpaceOnUse bounding
  // boxes and compositing groups cause chemical bond lines to disappear or clip at different zoom levels.
  // By converting mask circles into clean vector background circles painted under text, all bonds and
  // labels remain 100% stable across all PDF viewer zoom levels without any /SMask artifacts.
  const maskRegex = /<mask id="([^"]+)"[^>]*>([\s\S]*?)<\/mask>/g;
  const bgCircles: string[] = [];
  let maskMatch: RegExpExecArray | null;

  while ((maskMatch = maskRegex.exec(svg)) !== null) {
    const maskContent = maskMatch[2];
    const circleRegex = /<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)"[^>]*>/g;
    let cm: RegExpExecArray | null;
    while ((cm = circleRegex.exec(maskContent)) !== null) {
      const cx = cm[1];
      const cy = cm[2];
      // Controlled radius: tight enough to prevent bond truncation, generous enough for clear atom label readability
      const origR = parseFloat(cm[3]);
      const r = !isNaN(origR) && origR > 0 ? Math.min(origR, 7.5) : 7.0;
      bgCircles.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>`);
    }
  }

  // Remove mask elements and mask references from bond line groups
  svg = svg.replace(/<mask id="[^"]+"[^>]*>[\s\S]*?<\/mask>/g, "");
  svg = svg.replace(/\s*mask="url\(#[^"]+\)"/g, "");

  // Insert background circles right before the atom text groups
  if (bgCircles.length > 0) {
    const bgGroup = `<g class="chem-atom-bg">${bgCircles.join("")}</g>`;
    if (svg.includes("<g transform=") || svg.includes("<text")) {
      svg = svg.replace(/(<g transform=|<text)/, `${bgGroup}$1`);
    } else {
      svg = svg.replace("</svg>", `${bgGroup}</svg>`);
    }
  }

  return svg;
}

/**
 * Renders a valid SMILES string into a 2D vector SVG markup string.
 * Returns null if SMILES is empty, malformed, or fails to parse.
 */
export function renderSmilesToSvg(
  smiles: string | undefined | null,
  options: SmilesRenderOptions = {},
): string | null {
  if (!smiles || typeof smiles !== "string" || !smiles.trim()) {
    return null;
  }
  const cleanSmiles = smiles.trim();
  const width = options.width || 480;
  const height = options.height || 260;
  const padding = options.padding ?? 16;
  const bondThickness = options.bondThickness || 2.2;
  const bondLength = options.bondLength || 24;

  const cacheKey = `smiles:${cleanSmiles}:${width}:${height}:${bondThickness}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { document, SmilesDrawer } = ensureDomEnvironment();
    if (!SmilesDrawer) return null;

    let parseTree: any = null;
    let parseError: any = null;

    SmilesDrawer.parse(
      cleanSmiles,
      (tree: any) => {
        parseTree = tree;
      },
      (err: any) => {
        parseError = err;
      },
    );

    if (parseError || !parseTree) {
      return null;
    }

    const SvgDrawerClass = SmilesDrawer.SvgDrawer;
    const drawer = new SvgDrawerClass({
      width,
      height,
      bondThickness,
      bondLength,
      shortBondLength: 0.82,
      bondSpacing: 0.20 * bondLength,
      atomVisualization: "default",
      isomeric: true,
      compactDrawing: false,
      fontSizeLarge: 11,
      fontSizeSmall: 8,
      padding,
      themes: {
        light: {
          C: "#0f172a",
          O: "#dc2626",
          N: "#2563eb",
          F: "#059669",
          CL: "#16a34a",
          BR: "#9333ea",
          I: "#7c2d12",
          P: "#ea580c",
          S: "#d97706",
          B: "#0284c7",
          SI: "#475569",
          H: "#0f172a",
          BACKGROUND: "transparent",
        },
      },
    });

    const targetSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    targetSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    targetSvg.setAttribute("width", "100%");
    targetSvg.setAttribute("height", "100%");
    targetSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    targetSvg.setAttribute("class", "chem-svg-image");

    drawer.draw(parseTree, targetSvg, "light", false);
    fitSvgViewBox(targetSvg, width, height, padding);

    const rawResult = targetSvg.outerHTML;
    if (rawResult && rawResult.includes("<svg")) {
      const optimized = sanitizeAndOptimizeSvgForPdf(rawResult);
      setCached(cacheKey, optimized);
      return optimized;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Renders a reaction SMILES (e.g. `A.B>>C.D` or `A>>B`) into a 2D reaction scheme SVG.
 * Returns null if the reaction SMILES is invalid or cannot be parsed.
 */
export function renderReactionSmilesToSvg(
  reactionSmiles: string | undefined | null,
  options: ReactionRenderOptions = {},
): string | null {
  if (!reactionSmiles || typeof reactionSmiles !== "string" || !reactionSmiles.trim()) {
    return null;
  }
  const clean = reactionSmiles.trim();
  if (!clean.includes(">")) {
    return null;
  }

  const width = options.width || 620;
  const height = options.height || 220;
  const bondThickness = options.bondThickness || 2.0;
  const bondLength = options.bondLength || 22;

  const cacheKey = `rxn:${clean}:${width}:${height}:${bondThickness}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const { document, SmilesDrawer } = ensureDomEnvironment();
    if (!SmilesDrawer) return null;

    let rxnTree: any = null;
    let rxnError: any = null;

    SmilesDrawer.parseReaction(
      clean,
      (tree: any) => {
        rxnTree = tree;
      },
      (err: any) => {
        rxnError = err;
      },
    );

    if (rxnError || !rxnTree) {
      return null;
    }

    const ReactionDrawerClass = SmilesDrawer.ReactionDrawer;
    const rxnDrawer = new ReactionDrawerClass({
      width,
      height,
      bondThickness,
      bondLength,
      themes: {
        light: {
          C: "#0f172a",
          O: "#dc2626",
          N: "#2563eb",
          F: "#059669",
          CL: "#16a34a",
          BR: "#9333ea",
          I: "#7c2d12",
          P: "#ea580c",
          S: "#d97706",
          H: "#0f172a",
          BACKGROUND: "transparent",
        },
      },
    });

    const targetSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    targetSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    targetSvg.setAttribute("width", "100%");
    targetSvg.setAttribute("height", "auto");
    targetSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    targetSvg.setAttribute("class", "reaction-svg-scheme");

    rxnDrawer.draw(rxnTree, targetSvg, "light");

    const rawResult = targetSvg.outerHTML;
    if (rawResult && rawResult.includes("<svg") && !rawResult.includes("NaN")) {
      const optimized = sanitizeAndOptimizeSvgForPdf(rawResult);
      setCached(cacheKey, optimized);
      return optimized;
    }
    return null;
  } catch {
    return null;
  }
}
