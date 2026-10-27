import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { cleanEducationalTitle } from "@avana/domain";

export interface CourseCardOptions {
  title: string;
  subject?: string | null;
  description?: string | null;
  appBaseUrl?: string;
}

export interface CourseCardCacheEntry {
  buffer: Buffer;
  etag: string;
  updatedAt: string;
  title: string;
  subject: string | null;
  timestamp: number;
}

/**
 * Bounded LRU Cache for rendered Course Share Cards.
 * Prevents memory leaks and invalidates when course data is updated.
 */
export class CourseCardCache {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly store = new Map<string, CourseCardCacheEntry>();

  constructor(maxEntries = 500, ttlHours = 24) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  get(
    courseId: string,
    currentUpdatedAt: string,
    currentTitle: string,
    currentSubject: string | null,
  ): CourseCardCacheEntry | undefined {
    const entry = this.store.get(courseId);
    if (!entry) return undefined;

    // Check TTL expiration
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.store.delete(courseId);
      return undefined;
    }

    // Check version/data invalidation
    if (
      entry.updatedAt !== currentUpdatedAt ||
      entry.title !== currentTitle ||
      entry.subject !== (currentSubject ?? null)
    ) {
      this.store.delete(courseId);
      return undefined;
    }

    // Refresh LRU position
    this.store.delete(courseId);
    this.store.set(courseId, entry);
    return entry;
  }

  set(courseId: string, entry: CourseCardCacheEntry): void {
    if (this.store.has(courseId)) {
      this.store.delete(courseId);
    } else if (this.store.size >= this.maxEntries) {
      // Evict oldest entry (first item in Map)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
    this.store.set(courseId, entry);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

// Global cache instance for SEO routes
export const defaultCourseCardCache = new CourseCardCache(500, 24);

// Cached assets in memory (loaded on demand once)
let cachedFontBase64: string | null = null;
let cachedLogoBase64: string | null = null;
let cachedFallbackCard: Buffer | null = null;

async function loadFontBase64(): Promise<string> {
  if (cachedFontBase64) return cachedFontBase64;

  // 1. Try standard module resolution first (works in containers, symlinks, monorepo hoists)
  try {
    const { createRequire } = await import("node:module");
    const req = createRequire(import.meta.url);
    const resolvedPath = req.resolve(
      "@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2",
    );
    const fontBuffer = await readFile(resolvedPath);
    cachedFontBase64 = fontBuffer.toString("base64");
    return cachedFontBase64;
  } catch {
    // Fall back to candidate filesystem paths
  }

  const fontCandidates = [
    resolve(process.cwd(), "node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2"),
    resolve(process.cwd(), "apps/web/src/assets/fonts/IRANYekanX(Pro)/Farsi numerals/IRANYekanXFaNum-Bold.ttf"),
  ];

  for (const fontPath of fontCandidates) {
    try {
      const fontBuffer = await readFile(fontPath);
      cachedFontBase64 = fontBuffer.toString("base64");
      return cachedFontBase64;
    } catch {
      // try next
    }
  }
  return "";
}

async function loadLogoBase64(): Promise<string> {
  if (cachedLogoBase64) return cachedLogoBase64;
  const logoCandidates = [
    resolve(process.cwd(), "apps/web/public/brand/avana-logo.png"),
    resolve(process.cwd(), "apps/web/dist/brand/avana-logo.png"),
  ];

  for (const logoPath of logoCandidates) {
    try {
      const logoBuffer = await readFile(logoPath);
      cachedLogoBase64 = `data:image/png;base64,${logoBuffer.toString("base64")}`;
      return cachedLogoBase64;
    } catch {
      // try next
    }
  }
  return "";
}

export async function loadFallbackShareCard(): Promise<Buffer> {
  if (cachedFallbackCard) return cachedFallbackCard;
  const candidates = [
    resolve(process.cwd(), "apps/web/public/brand/avana-share-card.png"),
    resolve(process.cwd(), "apps/web/dist/brand/avana-share-card.png"),
  ];

  for (const filePath of candidates) {
    try {
      cachedFallbackCard = await readFile(filePath);
      return cachedFallbackCard;
    } catch {
      // try next
    }
  }
  // If not found on disk, create an in-memory 1200x630 fallback PNG
  cachedFallbackCard = await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 247, g: 249, b: 250, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  return cachedFallbackCard;
}

function escapeSvg(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrapPersianTitle(title: string, maxCharsPerLine = 34, maxLines = 2): string[] {
  const words = title.trim().replace(/\s+/g, " ").split(" ");
  const lines: string[] = [];
  let current = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) {
        // Final allowed line: truncate remainder cleanly
        let remaining = words.slice(i).join(" ");
        if (remaining.length > maxCharsPerLine) {
          const cut = remaining.slice(0, maxCharsPerLine - 1);
          const lastSpace = cut.lastIndexOf(" ");
          remaining = `${lastSpace > 15 ? cut.slice(0, lastSpace) : cut}…`;
        }
        lines.push(remaining);
        return lines;
      }
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Renders an official 1200x630 course share card with AVANA branding,
 * crisp Persian RTL typography, subject pill badge, and custom layout.
 */
export async function renderCourseShareCard(options: CourseCardOptions): Promise<Buffer> {
  try {
    const [fontBase64, logoBase64] = await Promise.all([
      loadFontBase64(),
      loadLogoBase64(),
    ]);

    const cleanTitle = cleanEducationalTitle(options.title || "دوره آموزشی در آوانا");
    const rawSubject = options.subject?.trim() || null;
    const hasSubject = Boolean(rawSubject && rawSubject.length > 0);
    const cleanSubject = hasSubject ? escapeSvg(rawSubject!) : "";

    const titleLines = wrapPersianTitle(cleanTitle, 35, 2);
    const escapedLines = titleLines.map(escapeSvg);

    const isSingleLine = escapedLines.length === 1;
    const fontSize = cleanTitle.length > 50 ? 42 : cleanTitle.length > 30 ? 46 : 52;
    const lineSpacing = fontSize + 18;

    const titleStartY = isSingleLine ? 310 : 275;

    // Optional short description / educational slogan
    let cleanSubtitle = "";
    if (options.description?.trim()) {
      const rawDesc = options.description.trim().replace(/\s+/g, " ");
      cleanSubtitle = rawDesc.length > 70 ? `${rawDesc.slice(0, 68)}…` : rawDesc;
    } else {
      cleanSubtitle = "یادگیری تعاملی، آزمون‌های گام‌به‌گام و مرور هوشمند فلش‌کارت‌ها در آوانا";
    }
    const escapedSubtitle = escapeSvg(cleanSubtitle);

    const fontFaceBlock = fontBase64
      ? `@font-face {
          font-family: 'Vazirmatn';
          src: url('data:font/woff2;charset=utf-8;base64,${fontBase64}') format('woff2');
          font-weight: 700;
          font-style: normal;
        }`
      : "";

    const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      ${fontFaceBlock}
      .font-brand {
        font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif;
      }
    </style>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#08171C" />
      <stop offset="60%" stop-color="#0D2329" />
      <stop offset="100%" stop-color="#051114" />
    </linearGradient>
    <linearGradient id="tealGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#008080" />
      <stop offset="100%" stop-color="#64D3CA" />
    </linearGradient>
    <radialGradient id="topGlow" cx="88%" cy="16%" r="50%">
      <stop offset="0%" stop-color="#008080" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#008080" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="bottomGlow" cx="12%" cy="88%" r="40%">
      <stop offset="0%" stop-color="#A7D0E6" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#A7D0E6" stop-opacity="0" />
    </radialGradient>
  </defs>

  <!-- Deep Brand Canvas Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)" />
  <circle cx="980" cy="110" r="420" fill="url(#topGlow)" />
  <circle cx="160" cy="540" r="320" fill="url(#bottomGlow)" />

  <!-- Subtle Ambient Grid Lines -->
  <line x1="72" y1="156" x2="1128" y2="156" stroke="#193A42" stroke-width="1" stroke-dasharray="4 8" opacity="0.6" />
  <line x1="72" y1="492" x2="1128" y2="492" stroke="#193A42" stroke-width="1" stroke-dasharray="4 8" opacity="0.6" />

  <!-- Outer Rounded Card Frame with Glowing Border -->
  <rect x="36" y="36" width="1128" height="558" rx="24" fill="none" stroke="#193A42" stroke-width="2" />
  <rect x="36" y="36" width="1128" height="558" rx="24" fill="none" stroke="url(#tealGrad)" stroke-width="1.5" opacity="0.5" />

  <!-- Top Left: AVANA Logo and Brandmark -->
  <g transform="translate(76, 70)">
    ${
      logoBase64
        ? `<image href="${logoBase64}" x="0" y="0" width="96" height="64" />`
        : `<rect width="48" height="48" rx="12" fill="#008080" />`
    }
    <text x="112" y="34" class="font-brand" font-size="20" font-weight="bold" fill="#64D3CA" letter-spacing="1">AVANA</text>
    <text x="112" y="54" class="font-brand" font-size="13" fill="#A7D0E6" opacity="0.85">سامانه هوشمند یادگیری</text>
  </g>

  <!-- Top Right: Subject Badge (Only rendered if valid subject exists) -->
  ${
    hasSubject
      ? `<g transform="translate(860, 78)">
    <rect x="0" y="0" width="260" height="42" rx="21" fill="#008080" fill-opacity="0.22" stroke="#64D3CA" stroke-opacity="0.5" stroke-width="1.5" />
    <circle cx="238" cy="21" r="5" fill="#64D3CA" />
    <text x="218" y="27" class="font-brand" font-size="16" font-weight="bold" fill="#64D3CA" text-anchor="start" direction="rtl">${cleanSubject}</text>
  </g>`
      : ""
  }

  <!-- Course Badge Pill -->
  <g transform="translate(1015, 195)">
    <rect x="0" y="0" width="105" height="28" rx="8" fill="#A7D0E6" fill-opacity="0.14" />
    <text x="52" y="19" class="font-brand" font-size="13" font-weight="bold" fill="#A7D0E6" text-anchor="middle">دوره آموزشی</text>
  </g>

  <!-- Main Course Title (RTL) -->
  ${escapedLines
    .map(
      (line, idx) =>
        `<text x="1120" y="${titleStartY + idx * lineSpacing}" class="font-brand" font-size="${fontSize}" font-weight="bold" fill="${
          idx === 0 ? "#FFFFFF" : "#D4E6EB"
        }" text-anchor="start" direction="rtl">${line}</text>`,
    )
    .join("\n  ")}

  <!-- Educational Subtitle -->
  <text x="1120" y="${titleStartY + (escapedLines.length - 1) * lineSpacing + 68}" class="font-brand" font-size="18" fill="#8FA5AD" text-anchor="start" direction="rtl">${escapedSubtitle}</text>

  <!-- Bottom Brand Divider & Platform Links -->
  <rect x="76" y="524" width="1048" height="2" rx="1" fill="url(#tealGrad)" opacity="0.85" />
  <g transform="translate(76, 560)">
    <text x="0" y="0" class="font-brand" font-size="14" font-weight="bold" fill="#64D3CA">aavana.ir/courses</text>
    <text x="1048" y="0" class="font-brand" font-size="14" fill="#8FA5AD" text-anchor="start" direction="rtl">پلتفرم تخصصی آموزش، آزمون و یادگیری آوانا</text>
  </g>
</svg>`;

    return await sharp(Buffer.from(svg))
      .png({ compressionLevel: 8, adaptiveFiltering: true })
      .toBuffer();
  } catch {
    // Graceful fallback to default brand share card if any rendering error occurs
    return await loadFallbackShareCard();
  }
}
